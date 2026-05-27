import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { JsonDatabase, id, now } from "./database";
import { getEnv, localRoots, workspaceDir } from "./env";
import { PatchPilotError } from "./errors";
import { assertSafeLocalPath } from "./pathSafety";
import { detectPackageManager, readPackageManifest } from "./packageDetection";
import { fetchEpss, fetchKev } from "./enrichment";
import { queryOsvFindings } from "./osv";
import { enrichVulnerability } from "./advisoryEnrichment";
import { scoreRisk } from "./risk";
import { scanAgentConfig } from "./agentConfigScanner";
import { runProjectScanners } from "./scanners";
import { createAuditReceipt } from "./audit";
import { closePullRequest, createDraftPullRequest, deleteBranchRef, validateGithubRepo } from "./github";
import { CODEX_REMEDIATION_PROMPT, codexStatus, runCodexExec, writeCodexContext } from "./codex";
import { assertLlmProviderConfigured, classifyAgentRemediation, isLlmProvider, requestRemediationPlan, type AgentProviderId } from "./agentProviders";
import {
  PROVIDER_AUDIT_ACTIONS,
  buildFailoverConsentMessage,
  checkChainReadiness,
  classifyProviderError,
  decideFailover,
  providerTrust,
  type FailoverConsentOption,
  type FailoverDecision,
  type ProviderReadiness
} from "./providerChain";
import { getSettings, setRepoFailoverPolicy } from "./settings";
import { diffLockfilePackage, updateManifestDependencyVersion, updateRequirementsVersion } from "./manifest";
import { assertSafeCommitState, changedFiles, cleanupValidationArtifacts, cloneGithubRepo, commitAll, createBranch, ensureCommitGitignore, initBaselineRepo, pushBranch, writePatch, applyPatch, scrubGithubRemote } from "./gitOps";
import { cleanupWorkspace, copyProjectToWorkspace, isSecretLikePath, retainWorkspaces } from "./workspace";
import { fixConfidence } from "./risk";
import { runCommand, safeNpmInstallCommand, validationInstallScriptsAllowed } from "./validation";
import { hashChatId } from "./approval";
import { inlineKeyboard, sendTelegramApproval, telegramCallbackData } from "./telegram";
import { createOpenAiRemediationPlan, createVercelAiRemediationPlan } from "./aiAdapters";
import type { Finding, JobEvent, Project, ProviderConsent, RemediationJob, ScanJob, ValidationRun, Vulnerability } from "./types";

export interface ProviderTimelineEntry {
  provider: string;
  model?: string;
  status: string;
  latencyMs?: number;
  reason?: string;
}

export interface GuardedRemediationResult {
  job?: RemediationJob;
  outcome: "completed" | "consent_requested" | "deterministic" | "failed";
  timeline: ProviderTimelineEntry[];
  decision?: FailoverDecision;
  consent?: ProviderConsent;
}

export class PatchPilotService {
  constructor(public db = new JsonDatabase()) {}

  /** Maps a provider id to the remediation agent that implements it. */
  private providerToAgent(provider: string): RemediationJob["agent"] | undefined {
    if (provider === "deterministic") return "deterministic-npm";
    if (provider === "codex" || provider === "openrouter" || provider === "openai-compatible" || provider === "anthropic" || provider === "grok" || provider === "ollama") return provider;
    return undefined;
  }

  /**
   * Runs the failover ladder for a finding: try the selected provider, and on a
   * retriable failure consult the chain. Cloud→cloud failover proceeds when
   * allowed; a lower-trust (local/deterministic) switch in "ask" mode creates a
   * Telegram consent request and does NOT run the lower-trust provider until the
   * user approves. Never silently switches provider class.
   */
  async startGuardedRemediation(findingId: string): Promise<GuardedRemediationResult> {
    const settings = getSettings(this.db);
    const finding = this.db.read().findings.find((item) => item.id === findingId);
    if (!finding) throw new PatchPilotError("finding_not_found", "Finding was not found.", { findingId }, 404);
    const chain = settings.failover.chain.length > 0 ? settings.failover.chain : ["codex", "deterministic"];
    const selected = chain[0] ?? "codex";
    const timeline: ProviderTimelineEntry[] = [];
    createAuditReceipt(this.db, {
      projectId: finding.projectId,
      actorType: "system",
      action: PROVIDER_AUDIT_ACTIONS.chainStarted,
      targetType: "finding",
      targetId: findingId,
      outputSummary: { chain, mode: settings.failover.mode, selected }
    });

    // 1) Attempt the selected provider only.
    let selectedJob: RemediationJob | undefined;
    const firstAgent = this.providerToAgent(selected);
    if (firstAgent) {
      createAuditReceipt(this.db, { projectId: finding.projectId, actorType: "system", agent: selected, action: PROVIDER_AUDIT_ACTIONS.attemptStarted, targetType: "finding", targetId: findingId, outputSummary: { provider: selected } });
      selectedJob = await this.startRemediation(findingId, firstAgent);
      const outcome = classifyAgentRemediation(selectedJob);
      if (outcome.completed) {
        timeline.push({ provider: selected, status: "completed" });
        createAuditReceipt(this.db, { projectId: finding.projectId, actorType: "system", agent: selected, action: PROVIDER_AUDIT_ACTIONS.attemptCompleted, targetType: "remediation_job", targetId: selectedJob.id, changedFiles: selectedJob.changedFiles, outputSummary: { provider: selected } });
        return { job: selectedJob, outcome: "completed", timeline };
      }
      const status = classifyProviderError(selectedJob.errorMessage ?? selectedJob.errorCode ?? "");
      timeline.push({ provider: selected, status, reason: selectedJob.errorCode });
      createAuditReceipt(this.db, { projectId: finding.projectId, actorType: "system", agent: selected, action: PROVIDER_AUDIT_ACTIONS.attemptFailed, targetType: "remediation_job", targetId: selectedJob.id, outputSummary: { provider: selected, status, errorCode: selectedJob.errorCode } });
    } else {
      timeline.push({ provider: selected, status: "not_configured", reason: "provider not implemented" });
    }

    // 2) Check chain readiness (cached) and decide the next step.
    const readiness = await checkChainReadiness(chain, settings.failover);
    createAuditReceipt(this.db, { projectId: finding.projectId, actorType: "system", action: PROVIDER_AUDIT_ACTIONS.readinessChecked, targetType: "finding", targetId: findingId, outputSummary: { readiness: readiness.map((entry) => ({ provider: entry.provider, status: entry.status, latencyMs: entry.latencyMs })) } });
    for (const entry of readiness) {
      if (!timeline.some((item) => item.provider === entry.provider)) {
        timeline.push({ provider: entry.provider, model: entry.model, status: entry.status, latencyMs: entry.latencyMs, reason: entry.failureReason });
      }
    }
    const statusMap = Object.fromEntries(readiness.map((entry) => [entry.provider, entry.status]));
    const repoAlwaysAllowLocal = settings.repoPolicies[finding.projectId]?.alwaysAllowLocal;
    const decision = decideFailover({ chain, readiness: statusMap, failedProvider: selected, settings: settings.failover, repoAlwaysAllowLocal });

    if (decision.action === "use_provider" && decision.provider) {
      const agent = this.providerToAgent(decision.provider);
      if (!agent) return { job: selectedJob, outcome: "failed", timeline, decision };
      createAuditReceipt(this.db, { projectId: finding.projectId, actorType: "system", agent: decision.provider, action: PROVIDER_AUDIT_ACTIONS.attemptStarted, targetType: "finding", targetId: findingId, outputSummary: { provider: decision.provider, reason: decision.reason } });
      const job2 = await this.startRemediation(findingId, agent);
      if (decision.trust === "local") {
        createAuditReceipt(this.db, { projectId: finding.projectId, actorType: "system", agent: decision.provider, action: PROVIDER_AUDIT_ACTIONS.localModelUsed, targetType: "remediation_job", targetId: job2.id, outputSummary: { provider: decision.provider } });
      }
      const outcome2 = classifyAgentRemediation(job2);
      timeline.push({ provider: decision.provider, status: outcome2.completed ? "completed" : classifyProviderError(job2.errorMessage ?? job2.errorCode ?? "") });
      return { job: job2, outcome: outcome2.completed ? "completed" : "failed", timeline, decision };
    }

    if (decision.action === "use_deterministic") {
      const jobD = await this.startRemediation(findingId, "deterministic-npm");
      createAuditReceipt(this.db, { projectId: finding.projectId, actorType: "system", agent: "deterministic-npm", action: PROVIDER_AUDIT_ACTIONS.deterministicUsed, targetType: "remediation_job", targetId: jobD.id, changedFiles: jobD.changedFiles, outputSummary: { reason: decision.reason } });
      timeline.push({ provider: "deterministic", status: classifyAgentRemediation(jobD).completed ? "completed" : "failed" });
      return { job: jobD, outcome: "deterministic", timeline, decision };
    }

    if (decision.action === "request_consent" && decision.provider) {
      const consent = this.requestProviderConsent(finding, selected, decision.provider, decision.trust ?? providerTrust(decision.provider), readiness);
      return { job: selectedJob, outcome: "consent_requested", timeline, decision, consent };
    }

    return { job: selectedJob, outcome: "failed", timeline, decision };
  }

  /** Records a provider-failover consent request and sends Telegram options (if configured). */
  private requestProviderConsent(finding: Finding, failedProvider: string, candidate: string, trust: ProviderConsent["candidateTrust"], readiness: ProviderReadiness[]): ProviderConsent {
    const consentId = id("pcon");
    const consent: ProviderConsent = {
      id: consentId,
      findingId: finding.id,
      projectId: finding.projectId,
      failedProvider,
      candidateProvider: candidate,
      candidateTrust: trust,
      status: "pending",
      readinessSummary: readiness.map((entry) => ({ provider: entry.provider, status: entry.status, latencyMs: entry.latencyMs, failureReason: entry.failureReason })),
      createdAt: now(),
      updatedAt: now()
    };
    this.db.update((state) => {
      state.providerConsents = state.providerConsents ?? [];
      state.providerConsents.push(consent);
    });

    const chats = (getEnv("TELEGRAM_ALLOWED_CHAT_IDS") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    const candidateEntry = readiness.find((entry) => entry.provider === candidate) ?? { provider: candidate, status: "ready", trust, lastCheckedAt: now() } as ProviderReadiness;
    if (getEnv("TELEGRAM_BOT_TOKEN") && chats.length > 0) {
      const text = buildFailoverConsentMessage(readiness, candidateEntry);
      // One tap per option — no tokens to copy.
      const buttons = inlineKeyboard([
        [{ text: "✅ Allow once", callbackData: telegramCallbackData("c", consentId, "allow_once") }],
        [{ text: "🔓 Always allow this repo", callbackData: telegramCallbackData("c", consentId, "always_allow_repo") }],
        [{ text: "🛠 Use deterministic fix", callbackData: telegramCallbackData("c", consentId, "use_deterministic") }],
        [{ text: "❌ Reject", callbackData: telegramCallbackData("c", consentId, "reject") }]
      ]);
      for (const chatId of chats) {
        void sendTelegramApproval({ chatId, text, replyMarkup: buttons }).catch(() => undefined);
      }
    } else {
      this.event("approval", consentId, "provider_consent.dashboard_only", "warn", "Telegram not configured; provider consent shown on dashboard only.");
    }
    createAuditReceipt(this.db, { projectId: finding.projectId, actorType: "system", action: PROVIDER_AUDIT_ACTIONS.consentRequested, targetType: "provider_consent", targetId: consentId, outputSummary: { failedProvider, candidate, trust } });
    return consent;
  }

  /** Resolves a provider-failover consent decision (from Telegram or dashboard). */
  async resolveProviderConsent(consentId: string, option: FailoverConsentOption, actorId?: string): Promise<{ status: string; job?: RemediationJob }> {
    const consent = this.db.read().providerConsents?.find((item) => item.id === consentId);
    if (!consent) throw new PatchPilotError("provider_consent_not_found", "Provider consent request was not found.", { consentId }, 404);
    if (consent.status !== "pending") return { status: consent.status };

    if (option === "reject") {
      this.updateConsent(consentId, { status: "rejected" });
      createAuditReceipt(this.db, { projectId: consent.projectId, actorType: "user", actorId, action: PROVIDER_AUDIT_ACTIONS.consentRejected, targetType: "provider_consent", targetId: consentId, outputSummary: { option } });
      return { status: "rejected" };
    }

    if (option === "always_allow_repo") {
      setRepoFailoverPolicy(this.db, consent.projectId, { alwaysAllowLocal: true });
    }
    const targetProvider = option === "use_deterministic" ? "deterministic" : consent.candidateProvider;
    const agent = this.providerToAgent(targetProvider);
    if (!agent) {
      this.updateConsent(consentId, { status: "resolved" });
      return { status: "resolved" };
    }
    createAuditReceipt(this.db, { projectId: consent.projectId, actorType: "user", actorId, action: PROVIDER_AUDIT_ACTIONS.consentApproved, targetType: "provider_consent", targetId: consentId, outputSummary: { option, provider: targetProvider } });
    const job = await this.startRemediation(consent.findingId, agent);
    if (agent === "deterministic-npm") {
      createAuditReceipt(this.db, { projectId: consent.projectId, actorType: "system", agent, action: PROVIDER_AUDIT_ACTIONS.deterministicUsed, targetType: "remediation_job", targetId: job.id, changedFiles: job.changedFiles, outputSummary: { viaConsent: true } });
    } else if (providerTrust(targetProvider) === "local") {
      createAuditReceipt(this.db, { projectId: consent.projectId, actorType: "system", agent, action: PROVIDER_AUDIT_ACTIONS.localModelUsed, targetType: "remediation_job", targetId: job.id, outputSummary: { viaConsent: true } });
    }
    this.updateConsent(consentId, { status: "resolved", resultRemediationJobId: job.id });
    return { status: "resolved", job };
  }

  private updateConsent(consentId: string, patch: Partial<ProviderConsent>): void {
    this.db.update((state) => {
      const index = (state.providerConsents ?? []).findIndex((item) => item.id === consentId);
      if (index >= 0 && state.providerConsents) state.providerConsents[index] = { ...state.providerConsents[index]!, ...patch, updatedAt: now() };
    });
  }

  async createProject(input: {
    sourceType: Project["sourceType"];
    name?: string;
    githubOwner?: string;
    githubRepo?: string;
    localPath?: string;
    deploymentUrl?: string;
    productionExposed?: boolean;
  }): Promise<Project> {
    const createdAt = now();
    let project: Project;
    if (input.sourceType === "github") {
      if (!input.githubOwner || !input.githubRepo) throw new PatchPilotError("github_repo_required", "githubOwner and githubRepo are required.");
      const repo = await validateGithubRepo(input.githubOwner, input.githubRepo);
      project = {
        id: id("proj"),
        name: input.name ?? repo.fullName,
        sourceType: "github",
        githubOwner: input.githubOwner,
        githubRepo: input.githubRepo,
        githubDefaultBranch: repo.defaultBranch,
        repoUrl: repo.cloneUrl,
        isPathAllowlisted: false,
        packageManager: "unknown",
        deploymentProvider: "none",
        deploymentUrl: input.deploymentUrl,
        productionExposed: input.productionExposed ?? false,
        private: repo.private,
        archived: repo.archived,
        createdAt,
        updatedAt: createdAt
      };
    } else if (input.sourceType === "local") {
      if (!input.localPath) throw new PatchPilotError("local_path_required", "localPath is required for local projects.");
      const safePath = assertSafeLocalPath(input.localPath, localRoots());
      const manifest = readPackageManifest(safePath);
      const vercelLinked = existsSync(path.join(safePath, ".vercel", "project.json"));
      project = {
        id: id("proj"),
        name: input.name ?? manifest?.name ?? path.basename(safePath),
        sourceType: vercelLinked ? "vercel-linked" : "local",
        localPath: safePath,
        isPathAllowlisted: true,
        packageManager: manifest?.packageManager ?? detectPackageManager(safePath),
        deploymentProvider: vercelLinked ? "vercel" : input.deploymentUrl ? "manual" : "none",
        deploymentUrl: input.deploymentUrl,
        productionExposed: input.productionExposed ?? false,
        stack: manifest?.stack ?? [],
        createdAt,
        updatedAt: createdAt
      };
    } else {
      throw new PatchPilotError("source_type_not_implemented", "This source type is modeled but not yet addable from this API.", { sourceType: input.sourceType });
    }
    this.db.update((state) => {
      state.projects.push(project);
    });
    createAuditReceipt(this.db, {
      projectId: project.id,
      actorType: "system",
      action: "project.created",
      targetType: "project",
      targetId: project.id,
      after: project
    });
    return project;
  }

  listProjects() {
    const state = this.db.read();
    return state.projects.map((project) => ({
      ...project,
      openFindings: state.findings.filter((finding) => finding.projectId === project.id && finding.status !== "resolved").length,
      criticalFindings: state.findings.filter((finding) => finding.projectId === project.id && finding.riskLevel === "critical").length
    }));
  }

  async scanProject(projectId: string): Promise<ScanJob> {
    const state = this.db.read();
    const project = state.projects.find((item) => item.id === projectId);
    if (!project) throw new PatchPilotError("project_not_found", "Project was not found.", { projectId }, 404);
    const scanJob: ScanJob = { id: id("scan"), projectId, status: "running", scanner: "osv-api", startedAt: now(), createdAt: now() };
    this.db.update((draft) => draft.scanJobs.push(scanJob));
    let sourcePath: string | undefined;
    let cleanupSource = false;
    try {
      const resolved = await this.resolveProjectPath(project);
      sourcePath = resolved.path;
      cleanupSource = resolved.cleanup;
      const projectPath = sourcePath;
      const manifest = readPackageManifest(projectPath);
      if (!manifest) throw new PatchPilotError("unsupported_project", "No package.json was found. PatchPilot currently scans Node.js projects.");
      const agentFindings = scanAgentConfig(projectPath, project.id);
      const osvResult = await queryOsvFindings(projectPath, manifest);
      const normalized = await Promise.all(osvResult.findings.map(async (item) => ({
        ...item,
        vulnerability: await enrichVulnerability(item.vulnerability)
      })));
      const cves = [...new Set(normalized.flatMap((finding) => finding.vulnerability.cveIds))];
      const [epss, kev] = await Promise.all([fetchEpss(cves), fetchKev(cves)]);
      const savedFindings: Finding[] = [];
      this.db.update((draft) => {
        const projectIndex = draft.projects.findIndex((item) => item.id === project.id);
        if (projectIndex >= 0) {
          draft.projects[projectIndex] = {
            ...draft.projects[projectIndex]!,
            packageManager: manifest.packageManager,
            stack: manifest.stack,
            lastScanAt: now(),
            lastScanStatus: "completed",
            updatedAt: now()
          };
        }
        draft.findings = draft.findings.filter((finding) => finding.projectId !== project.id || finding.status !== "open");
        draft.agentFindings = draft.agentFindings.filter((finding) => finding.projectId !== project.id).concat(agentFindings);
        for (const item of normalized) {
          let vulnerability = draft.vulnerabilities.find((vuln) => vuln.id === item.vulnerability.id);
          if (!vulnerability) {
            vulnerability = item.vulnerability;
            draft.vulnerabilities.push(vulnerability);
          }
          const bestEpss = item.vulnerability.cveIds.map((cve) => epss.get(cve)).find(Boolean);
          const bestKev = item.vulnerability.cveIds.map((cve) => kev.get(cve)).find(Boolean);
          const risk = scoreRisk({
            vulnerability,
            project,
            dependencyType: item.dependencyType,
            fixedVersion: item.fixedVersion,
            epssProbability: bestEpss?.epss,
            epssPercentile: bestEpss?.percentile,
            isInKev: bestKev ? true : false,
            scanConfidence: osvResult.scanConfidence
          });
          const finding: Finding = {
            id: id("find"),
            projectId: project.id,
            scanJobId: scanJob.id,
            vulnerabilityId: vulnerability.id,
            packageName: item.packageName,
            ecosystem: item.ecosystem,
            currentVersion: item.currentVersion,
            fixedVersion: item.fixedVersion,
            affectedRanges: item.affectedRanges,
            dependencyType: item.dependencyType,
            manifestPath: path.relative(projectPath, manifest.manifestPath),
            lockfilePath: manifest.lockfilePath ? path.relative(projectPath, manifest.lockfilePath) : undefined,
            riskScore: risk.score,
            riskLevel: risk.level,
            riskFactors: risk.factors,
            missingRiskData: risk.missing,
            fixStrategy: item.fixedVersion ? "safe_patch" : "manual_review",
            status: item.fixedVersion ? "fix_available" : "open",
            scanConfidence: osvResult.scanConfidence,
            createdAt: now(),
            updatedAt: now()
          };
          draft.findings.push(finding);
          draft.riskSignals.push({ id: id("risk"), findingId: finding.id, ...risk.signal, kevDueDate: bestKev?.dueDate, kevKnownRansomwareUse: bestKev?.knownRansomwareCampaignUse });
          savedFindings.push(finding);
        }
        const jobIndex = draft.scanJobs.findIndex((job) => job.id === scanJob.id);
        draft.scanJobs[jobIndex] = { ...scanJob, scanner: osvResult.scanner, status: "completed", finishedAt: now() };
      });
      // Run the non-SCA scanner matrix (built-ins always; external tools when
      // installed). Failures here never break the dependency scan.
      const scannerCounts = this.runAndStoreScanners(project.id, projectPath);
      createAuditReceipt(this.db, {
        projectId: project.id,
        actorType: "system",
        action: "scan.completed",
        targetType: "scan_job",
        targetId: scanJob.id,
        outputSummary: { findings: savedFindings.length, agentWarnings: agentFindings.length, scannerFindings: scannerCounts }
      });
      if (cleanupSource && sourcePath) cleanupWorkspace(sourcePath);
      return { ...scanJob, scanner: osvResult.scanner, status: "completed", finishedAt: now() };
    } catch (error) {
      if (cleanupSource && sourcePath) cleanupWorkspace(sourcePath);
      const code = error instanceof PatchPilotError ? error.code : "scan_failed";
      const message = error instanceof Error ? error.message : String(error);
      this.db.update((draft) => {
        const jobIndex = draft.scanJobs.findIndex((job) => job.id === scanJob.id);
        draft.scanJobs[jobIndex] = { ...scanJob, status: code === "unsupported_project" ? "failed_invalid_project" : "failed_external_service", errorCode: code, errorMessage: message, finishedAt: now() };
        const projectIndex = draft.projects.findIndex((item) => item.id === project.id);
        if (projectIndex >= 0) draft.projects[projectIndex] = { ...draft.projects[projectIndex]!, lastScanAt: now(), lastScanStatus: code, updatedAt: now() };
      });
      createAuditReceipt(this.db, {
        projectId: project.id,
        actorType: "system",
        action: "scan.failed",
        targetType: "scan_job",
        targetId: scanJob.id,
        outputSummary: { code, message }
      });
      throw error;
    }
  }

  async scanAll(): Promise<{ mode: "inline"; scanned: number; scanJobIds: string[]; errors: Array<{ projectId: string; code: string; message: string }> }> {
    const projects = this.db.read().projects;
    const scanJobIds: string[] = [];
    const errors: Array<{ projectId: string; code: string; message: string }> = [];
    for (const project of projects) {
      try {
        const job = await this.scanProject(project.id);
        scanJobIds.push(job.id);
      } catch (error) {
        errors.push({ projectId: project.id, code: error instanceof PatchPilotError ? error.code : "scan_failed", message: error instanceof Error ? error.message : String(error) });
      }
    }
    return { mode: "inline", scanned: scanJobIds.length, scanJobIds, errors };
  }

  threatRadar() {
    const state = this.db.read();
    const scannerFindings = state.scannerFindings ?? [];
    const byCategory = (category: string) => scannerFindings.filter((finding) => finding.category === category).length;
    return {
      advisoriesScanned: state.vulnerabilities.length,
      relevantAdvisories: new Set(state.findings.map((finding) => finding.vulnerabilityId)).size,
      affectedProjects: new Set(state.findings.map((finding) => finding.projectId)).size,
      criticalHighRisks: state.findings.filter((finding) => ["critical", "high"].includes(finding.riskLevel)).length,
      activelyExploited: state.riskSignals.filter((signal) => signal.isInKev).length,
      maliciousPackageAlerts: state.riskSignals.filter((signal) => signal.notes.some((note) => note.toLowerCase().includes("malicious"))).length + byCategory("malware"),
      fixesAvailable: state.findings.filter((finding) => Boolean(finding.fixedVersion)).length,
      fixesBlocked: state.findings.filter((finding) => !finding.fixedVersion || finding.status === "rejected").length,
      jobsRunning: state.remediationJobs.filter((job) => ["queued", "running"].includes(job.status)).length,
      approvalsPending: state.approvals.filter((approval) => approval.status === "pending").length,
      // Aggregated scanner-matrix signals (real findings only).
      exposedSecrets: byCategory("secret"),
      sastFindings: byCategory("sast"),
      riskyWorkflows: byCategory("ci"),
      agentConfigRisks: byCategory("agent"),
      licenseIssues: byCategory("license"),
      containerIacIssues: byCategory("container") + byCategory("iac"),
      pendingProviderConsents: (state.providerConsents ?? []).filter((consent) => consent.status === "pending").length,
      watchAlerts: (state.watchAlerts ?? []).length,
      source: "real_database_state"
    };
  }

  blastRadius() {
    const state = this.db.read();
    return state.findings.map((finding) => {
      const project = state.projects.find((item) => item.id === finding.projectId);
      const vulnerability = state.vulnerabilities.find((item) => item.id === finding.vulnerabilityId);
      const remediation = state.remediationJobs.find((job) => job.findingId === finding.id);
      const pr = remediation ? state.pullRequests.find((item) => item.remediationJobId === remediation.id) : undefined;
      const validation = remediation ? state.validationRuns.filter((item) => item.remediationJobId === remediation.id) : [];
      return {
        finding,
        project,
        vulnerability,
        directness: finding.dependencyType,
        fixAvailable: Boolean(finding.fixedVersion),
        internetFacing: project?.productionExposed ?? false,
        codexJobStatus: remediation?.status,
        prUrl: pr?.url,
        validationPassed: validation.length > 0 && validation.every((run) => run.status === "passed" || run.status === "skipped_no_script"),
        approvalPending: remediation ? state.approvals.some((approval) => approval.remediationJobId === remediation.id && approval.status === "pending") : false
      };
    });
  }

  async startRemediation(
    findingId: string,
    agent: RemediationJob["agent"] | "vercel-ai" = "codex",
    options: { codexPrompt?: string; codexTimeoutMs?: number; ownLockfile?: boolean } = {}
  ): Promise<RemediationJob> {
    const state = this.db.read();
    const finding = state.findings.find((item) => item.id === findingId);
    if (!finding) throw new PatchPilotError("finding_not_found", "Finding was not found.", { findingId }, 404);
    const project = state.projects.find((item) => item.id === finding.projectId);
    const vulnerability = state.vulnerabilities.find((item) => item.id === finding.vulnerabilityId);
    if (!project || !vulnerability) throw new PatchPilotError("finding_context_missing", "Finding project or vulnerability record is missing.", { findingId });

    const job: RemediationJob = {
      id: id("rem"),
      findingId,
      projectId: project.id,
      status: "running",
      agent: agent === "vercel-ai" ? "openai" : agent,
      baseBranch: project.githubDefaultBranch ?? "main",
      changedFiles: [],
      rollbackStatus: "not_available",
      createdAt: now(),
      startedAt: now()
    };
    this.db.update((draft) => {
      draft.remediationJobs.push(job);
      const index = draft.findings.findIndex((item) => item.id === findingId);
      if (index >= 0) draft.findings[index] = { ...draft.findings[index]!, status: "fix_running", updatedAt: now() };
    });
    this.event("remediation", job.id, "remediation.job.started", "info", "Remediation job started.", { agent });

    const context = this.remediationContext(project, finding, vulnerability);
    if (agent === "openai" || agent === "vercel-ai" || agent === "manual") {
      return this.createPlanOnlyRemediation(job, context, agent);
    }

    const codex = codexStatus();
    if (agent === "codex" && !codex.configured) {
      return this.failRemediation(job, "codex_unavailable", `Codex not executed: ${codex.message}`, {
        summary: `Plan only: update ${finding.packageName} from ${finding.currentVersion} to ${finding.fixedVersion ?? "a safe version when available"} and validate in an isolated workspace.`,
        status: "codex_not_executed"
      });
    }

    // LLM advisor providers must be configured before we touch a workspace. They
    // never edit the repo themselves; PatchPilot applies their validated plan.
    const usesLlmProvider = isLlmProvider(agent as AgentProviderId);
    if (usesLlmProvider) {
      try {
        assertLlmProviderConfigured(agent as AgentProviderId);
      } catch (error) {
        return this.failRemediation(job, error instanceof PatchPilotError ? error.code : "llm_provider_not_configured", error instanceof Error ? error.message : String(error));
      }
    }

    let remediationWorkspace: string | undefined;
    let remediationGithub: { owner: string; repo: string } | undefined;
    try {
      const workspace = path.join(workspaceDir(), job.id);
      remediationWorkspace = workspace;
      mkdirSync(path.dirname(workspace), { recursive: true });
      if (project.sourceType === "github") {
        if (!project.githubOwner || !project.githubRepo) throw new PatchPilotError("github_metadata_missing", "GitHub project is missing owner/repo metadata.");
        remediationGithub = { owner: project.githubOwner, repo: project.githubRepo };
        cloneGithubRepo({ owner: project.githubOwner, repo: project.githubRepo, branch: project.githubDefaultBranch ?? "main", workspace, remoteUrl: project.repoUrl });
        const branch = `patchpilot/${safeSlug(finding.packageName)}-${safeSlug(vulnerability.cveIds[0] ?? vulnerability.id)}-${job.id.slice(-5)}`;
        createBranch(workspace, branch);
        job.branchName = branch;
      } else if (project.localPath) {
        copyProjectToWorkspace(project.localPath, workspace);
        initBaselineRepo(workspace);
      } else {
        throw new PatchPilotError("source_unavailable", "Project source could not be resolved for remediation.", { projectId: project.id });
      }

      ensureCommitGitignore(workspace);
      this.updateJob(job.id, { workspacePath: workspace, branchName: job.branchName });
      this.event("remediation", job.id, "remediation.workspace.created", "info", "Disposable workspace created.", { workspace });
      const lockfilePath = path.join(workspace, "package-lock.json");
      const baselineLockfile = existsSync(lockfilePath) ? readFileSync(lockfilePath, "utf8") : "";
      writeCodexContext(workspace, context);
      let agentSummary = "";
      if (agent === "deterministic-npm") {
        this.event("remediation", job.id, "deterministic_npm.started", "info", "Deterministic npm remediation started.");
        agentSummary = this.applyDeterministicNpmFix(workspace, finding);
        this.event("remediation", job.id, "deterministic_npm.completed", "info", "Deterministic npm remediation completed.", { summary: agentSummary });
      } else if (usesLlmProvider) {
        // The model only advises (strict JSON plan). PatchPilot applies the safe
        // version bump itself — the model never edits files or runs commands.
        if (!finding.fixedVersion) {
          return this.failRemediation(job, "fixed_version_missing", "No known fixed version is available for an LLM-planned remediation.");
        }
        this.event("remediation", job.id, `llm.plan.requested`, "info", "LLM remediation plan requested.", { provider: agent });
        const planResult = await requestRemediationPlan(agent as AgentProviderId, context, {
          packageName: finding.packageName,
          fromVersion: finding.currentVersion,
          fixedVersion: finding.fixedVersion
        });
        this.event("remediation", job.id, "llm.plan.received", "info", "LLM remediation plan validated.", {
          provider: planResult.provider,
          model: planResult.model,
          toVersion: planResult.plan.toVersion
        });
        agentSummary = this.applyNpmVersionFix(workspace, finding.packageName, planResult.plan.toVersion, finding.ecosystem)
          + ` (plan by ${planResult.provider}/${planResult.model}: ${planResult.plan.summary})`;
        this.event("remediation", job.id, "llm.plan.applied", "info", "PatchPilot applied the validated plan.", { summary: agentSummary });
      } else {
        this.event("remediation", job.id, "codex.started", "info", "Codex CLI execution started.");
        const result = runCodexExec(workspace, options.codexPrompt ?? CODEX_REMEDIATION_PROMPT, { timeoutMs: options.codexTimeoutMs });
        agentSummary = result.stdout.slice(0, 4000);
        this.event("remediation", job.id, "codex.completed", result.status === 0 ? "info" : "error", "Codex CLI execution completed.", {
          status: result.status,
          durationMs: result.durationMs,
          stderr: result.stderr.slice(0, 1200)
        });
        if (result.status !== 0) {
          const timedOut = result.timedOut || result.status === 124;
          return this.failRemediation(job, timedOut ? "codex_timeout" : "codex_failed", timedOut ? "Codex CLI timed out before producing a safe remediation." : "Codex CLI returned a non-zero exit code.", { summary: result.stderr || result.stdout });
        }
      }

      rmSync(path.join(workspace, "patchpilot-context.json"), { force: true });
      const files = changedFiles(workspace);
      assertSafeCommitState(workspace, files);
      if (files.length === 0) {
        const noChangeCode = agent === "deterministic-npm" ? "deterministic_no_changes" : usesLlmProvider ? `${agent}_no_changes` : "codex_no_changes";
        return this.failRemediation(job, noChangeCode, `${agent} completed but produced no file changes.`, { summary: agentSummary });
      }
      const forbidden = files.filter((file) => isSecretLikePath(file));
      if (forbidden.length > 0) {
        return this.failRemediation(job, "forbidden_files_changed", "Codex changed secret-like or forbidden files; PR/patch creation is blocked.", { changedFiles: files });
      }
      this.updateJob(job.id, { changedFiles: files, summary: agentSummary });
      this.event("remediation", job.id, "git.diff.computed", "info", "Changed files recorded.", { files });

      const validations = await this.runValidationSuite(job.id, workspace, { ownLockfile: options.ownLockfile });
      cleanupValidationArtifacts(workspace);
      assertSafeCommitState(workspace);
      // When PatchPilot owns the lockfile, the validation step regenerated
      // package-lock.json after the agent's edits, so recompute the commit set to
      // include it (still rejecting any secret-like files that appeared).
      let commitFiles = files;
      if (options.ownLockfile) {
        const refreshed = changedFiles(workspace);
        const refreshedForbidden = refreshed.filter((file) => isSecretLikePath(file));
        if (refreshedForbidden.length > 0) {
          return this.failRemediation(job, "forbidden_files_changed", "PatchPilot lockfile regeneration produced secret-like or forbidden files; PR/patch creation is blocked.", { changedFiles: refreshed });
        }
        assertSafeCommitState(workspace, refreshed);
        commitFiles = refreshed.length > 0 ? refreshed : files;
        this.updateJob(job.id, { changedFiles: commitFiles });
        this.event("remediation", job.id, "git.lockfile.regenerated", "info", "PatchPilot regenerated the lockfile after the scoped edit.", { files: commitFiles });
      }
      // Lightweight before/after lockfile diff for the vulnerable package.
      const afterLockfile = existsSync(lockfilePath) ? readFileSync(lockfilePath, "utf8") : "";
      const lockfileDiff = baselineLockfile && afterLockfile
        ? diffLockfilePackage(baselineLockfile, afterLockfile, finding.packageName)
        : undefined;
      if (lockfileDiff?.changed) {
        this.event("remediation", job.id, "lockfile.diff", "info", "Lockfile version change detected.", { ...lockfileDiff });
      }
      const validationFailed = validations.some((run) => run.status === "failed" || run.status === "timeout");
      const confidence = fixConfidence({
        minimalVersionBump: true,
        lockfileUpdated: commitFiles.some((file) => file.includes("lock")),
        testsPassed: validations.some((run) => run.command.includes("test") && run.status === "passed"),
        buildPassed: validations.some((run) => run.command.includes("build") && run.status === "passed"),
        unrelatedFilesChanged: commitFiles.some((file) => !["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "patchpilot-context.json"].includes(file) && !file.startsWith("src/") && !file.startsWith("test")),
        secretsTouched: forbidden.length > 0,
        smallDiff: commitFiles.length <= 4,
        missingTests: validations.some((run) => run.command === "npm test" && run.status === "skipped_no_script"),
        missingBuild: validations.some((run) => run.command === "npm run build" && run.status === "skipped_no_script"),
        majorUpgrade: false,
        validationSkipped: validations.every((run) => run.status === "skipped_no_script"),
        newInstallScripts: false,
        validationFailed
      });
      this.updateJob(job.id, { fixConfidence: confidence });
      if (validationFailed) {
        return this.failRemediation(job, "validation_failed", "Validation failed; PR/approval creation is blocked.", { status: "validation_failed" });
      }

      if (project.sourceType === "github" && project.githubOwner && project.githubRepo) {
        commitAll(workspace, `fix(security): patch ${finding.packageName} vulnerability`, commitFiles);
        pushBranch(workspace, job.branchName!, project.githubOwner, project.githubRepo);
        const receipt = createAuditReceipt(this.db, {
          projectId: project.id,
          actorType: "system",
          agent: "codex",
          action: "remediation.validation_passed",
          targetType: "remediation_job",
          targetId: job.id,
          changedFiles: commitFiles,
          outputSummary: { confidence, lockfileDiff }
        });
        const pr = await createDraftPullRequest({
          owner: project.githubOwner,
          repo: project.githubRepo,
          title: `fix(security): patch ${finding.packageName} vulnerability`,
          head: job.branchName!,
          base: project.githubDefaultBranch ?? "main",
          body: prBody({ finding, vulnerability, validationRuns: validations, receiptId: receipt.id, confidence, changedFiles: commitFiles })
        });
        this.db.update((draft) => {
          draft.pullRequests.push({
            id: id("pr"),
            remediationJobId: job.id,
            provider: "github",
            owner: project.githubOwner!,
            repo: project.githubRepo!,
            number: pr.number,
            url: pr.url,
            branchName: job.branchName!,
            baseBranch: project.githubDefaultBranch ?? "main",
            draft: true,
            status: "created",
            createdAt: now()
          });
        });
        this.event("remediation", job.id, "github.pr.created", "info", "Draft pull request created.", { url: pr.url });
        await this.trySendApproval(job.id, project, finding, pr.url);
        // Rollback for a GitHub draft PR = close the PR + delete the branch.
        this.updateJob(job.id, { status: "approval_sent", finishedAt: now(), rollbackStatus: "available" });
      } else {
        const patchPath = writePatch(workspace, job.id, commitFiles);
        this.updateJob(job.id, { patchPath, status: "pr_ready", finishedAt: now(), rollbackStatus: "not_available" });
        createAuditReceipt(this.db, {
          projectId: project.id,
          actorType: "system",
          agent: "codex",
          action: "local_patch.created",
          targetType: "remediation_job",
          targetId: job.id,
          changedFiles: commitFiles,
          commandLogsRef: patchPath,
          outputSummary: { confidence, patchPath, lockfileDiff }
        });
        await this.trySendApproval(job.id, project, finding);
      }

      return this.db.read().remediationJobs.find((item) => item.id === job.id)!;
    } catch (error) {
      return this.failRemediation(job, error instanceof PatchPilotError ? error.code : "remediation_failed", error instanceof Error ? error.message : String(error));
    } finally {
      if (remediationWorkspace) {
        if (remediationGithub && retainWorkspaces()) scrubGithubRemote(remediationWorkspace, remediationGithub.owner, remediationGithub.repo);
        cleanupWorkspace(remediationWorkspace);
      }
    }
  }

  async rollback(remediationJobId: string): Promise<RemediationJob> {
    const state = this.db.read();
    const job = state.remediationJobs.find((item) => item.id === remediationJobId);
    if (!job) throw new PatchPilotError("remediation_not_found", "Remediation job was not found.", { remediationJobId }, 404);
    const project = state.projects.find((item) => item.id === job.projectId);
    if (!project) throw new PatchPilotError("project_not_found", "Project was not found.", { projectId: job.projectId }, 404);
    if (job.rollbackStatus !== "available") {
      throw new PatchPilotError("rollback_not_available", "Rollback is not available for this remediation job.", { remediationJobId, rollbackStatus: job.rollbackStatus ?? "not_available" });
    }
    this.updateJob(job.id, { rollbackStatus: "requested" });
    try {
      const pr = state.pullRequests.find((item) => item.remediationJobId === job.id && item.provider === "github" && item.status === "created");
      if (project.sourceType === "github" && pr && typeof pr.number === "number") {
        // Close the draft PR and delete its branch (no merge ever happened).
        await closePullRequest(pr.owner, pr.repo, pr.number);
        await deleteBranchRef(pr.owner, pr.repo, pr.branchName);
        this.db.update((draft) => {
          const stored = draft.pullRequests.find((item) => item.id === pr.id);
          if (stored) stored.status = "closed";
        });
        this.updateJob(job.id, { rollbackStatus: "completed" });
      } else if (project.localPath && job.patchPath && job.patchAppliedAt) {
        applyPatch(project.localPath, job.patchPath, true);
        this.updateJob(job.id, { rollbackStatus: "completed" });
      } else {
        throw new PatchPilotError("rollback_not_available", "Rollback requires an applied local patch or an open GitHub PR.", { remediationJobId });
      }
      createAuditReceipt(this.db, {
        projectId: project.id,
        actorType: "system",
        action: "rollback.completed",
        targetType: "remediation_job",
        targetId: job.id,
        changedFiles: job.changedFiles,
        outputSummary: { rollbackStatus: "completed" }
      });
    } catch (error) {
      this.updateJob(job.id, { rollbackStatus: "failed" });
      createAuditReceipt(this.db, {
        projectId: project.id,
        actorType: "system",
        action: "rollback.failed",
        targetType: "remediation_job",
        targetId: job.id,
        outputSummary: { message: error instanceof Error ? error.message : String(error) }
      });
      throw error;
    }
    return this.db.read().remediationJobs.find((item) => item.id === job.id)!;
  }

  private async resolveProjectPath(project: Project): Promise<{ path: string; cleanup: boolean }> {
    if (project.localPath) return { path: project.localPath, cleanup: false };
    if (project.sourceType === "github") {
      if (!project.githubOwner || !project.githubRepo) throw new PatchPilotError("github_metadata_missing", "GitHub project is missing owner/repo metadata.");
      const workspace = path.join(workspaceDir(), `scan_${project.id}_${Date.now()}`);
      mkdirSync(path.dirname(workspace), { recursive: true });
      try {
        cloneGithubRepo({ owner: project.githubOwner, repo: project.githubRepo, branch: project.githubDefaultBranch ?? "main", workspace, remoteUrl: project.repoUrl });
      } catch (error) {
        cleanupWorkspace(workspace);
        throw error;
      }
      return { path: workspace, cleanup: !retainWorkspaces() };
    }
    const workspace = path.join(workspaceDir(), project.id);
    mkdirSync(workspace, { recursive: true });
    return { path: workspace, cleanup: false };
  }

  private async createPlanOnlyRemediation(job: RemediationJob, context: unknown, agent: "openai" | "vercel-ai" | "manual"): Promise<RemediationJob> {
    try {
      const summary = agent === "openai"
        ? await createOpenAiRemediationPlan(context)
        : agent === "vercel-ai"
          ? await createVercelAiRemediationPlan(context)
          : `Manual plan: inspect patchpilot context, update the vulnerable package to the smallest safe fixed version, run install/test/build, and open a draft PR or local patch.`;
      this.updateJob(job.id, {
        status: agent === "manual" ? "codex_not_executed" : "completed",
        summary,
        finishedAt: now(),
        agent: agent === "manual" ? "manual" : "openai"
      });
      createAuditReceipt(this.db, {
        projectId: job.projectId,
        actorType: "agent",
        agent,
        action: "remediation.plan_created",
        targetType: "remediation_job",
        targetId: job.id,
        outputSummary: { summary }
      });
      return this.db.read().remediationJobs.find((item) => item.id === job.id)!;
    } catch (error) {
      return this.failRemediation(job, error instanceof PatchPilotError ? error.code : "agent_plan_failed", error instanceof Error ? error.message : String(error));
    }
  }

  private async runValidationSuite(remediationJobId: string, workspace: string, options: { ownLockfile?: boolean } = {}): Promise<ValidationRun[]> {
    const manifest = readPackageManifest(workspace);
    if (!manifest) throw new PatchPilotError("validation_manifest_missing", "Cannot run validation without package.json.");
    // When PatchPilot owns the lockfile (e.g. scoped Codex edited only package.json),
    // it regenerates the lockfile itself, then validates with `npm ci`. This keeps
    // Codex usage minimal while PatchPilot stays in control of install/test/build.
    const hasLockfile = existsSync(path.join(workspace, "package-lock.json")) || Boolean(options.ownLockfile);
    const commands = [
      options.ownLockfile ? "npm install --package-lock-only --ignore-scripts" : undefined,
      safeNpmInstallCommand(hasLockfile),
      manifest.scripts.test ? "npm test" : undefined,
      manifest.scripts.build ? "npm run build" : undefined,
      manifest.scripts.lint ? "npm run lint" : undefined
    ];
    if (!validationInstallScriptsAllowed() && ["preinstall", "install", "postinstall"].some((script) => manifest.scripts[script])) {
      this.event("validation", remediationJobId, "validation.lifecycle_scripts_ignored", "warn", "npm install lifecycle scripts are disabled for validation safe mode.");
    }
    const runs: ValidationRun[] = [];
    for (const command of commands) {
      if (!command) continue;
      this.event("validation", remediationJobId, `validation.${command}.started`, "info", `${command} started.`);
      const run = await runCommand(command, workspace, remediationJobId);
      this.db.update((state) => state.validationRuns.push(run));
      this.event("validation", remediationJobId, `validation.${command}.completed`, run.status === "passed" ? "info" : "error", `${command} ${run.status}.`, {
        exitCode: run.exitCode,
        logPath: run.logPath
      });
      runs.push(run);
      if (run.status === "failed" || run.status === "timeout") break;
    }
    for (const skipped of ["test", "build"].filter((script) => !manifest.scripts[script])) {
      const run: ValidationRun = { id: id("val"), remediationJobId, command: `npm ${skipped === "test" ? "test" : "run build"}`, status: "skipped_no_script", durationMs: 0, createdAt: now() };
      this.db.update((state) => state.validationRuns.push(run));
      runs.push(run);
    }
    return runs;
  }

  private async trySendApproval(jobId: string, project: Project, finding: Finding, prUrl?: string): Promise<void> {
    const chats = (getEnv("TELEGRAM_ALLOWED_CHAT_IDS") ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    if (!getEnv("TELEGRAM_BOT_TOKEN") || !getEnv("APPROVAL_HMAC_SECRET") || chats.length === 0) {
      this.event("approval", jobId, "telegram.not_configured", "warn", "Telegram approval was not sent because required configuration is missing.");
      return;
    }
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    for (const chatId of chats) {
      const approvalId = id("appr");
      const message = [
        "PatchPilot approval needed",
        "",
        `Project: ${project.name}`,
        `Package: ${finding.packageName}`,
        `Risk: ${finding.riskScore}/100 ${finding.riskLevel}`,
        `Fix: ${finding.currentVersion} -> ${finding.fixedVersion ?? "manual review"}`,
        prUrl ? `PR: ${prUrl}` : "Patch: local artifact pending review",
        "",
        "Tap a button below. Nothing is merged or deployed automatically."
      ].join("\n");
      // Inline buttons (tap, don't type). callback_data is a short opaque payload;
      // the webhook authenticates via the Telegram secret header + chat allowlist.
      const result = await sendTelegramApproval({
        chatId,
        text: message,
        replyMarkup: inlineKeyboard([[
          { text: "✅ Approve", callbackData: telegramCallbackData("a", approvalId, "approve") },
          { text: "❌ Reject", callbackData: telegramCallbackData("a", approvalId, "reject") }
        ]])
      });
      this.db.update((state) => {
        state.approvals.push({
          id: approvalId,
          remediationJobId: jobId,
          channel: "telegram",
          chatIdHash: hashChatId(chatId),
          messageId: result.messageId,
          status: "pending",
          expiresAt: expiresAt.toISOString(),
          createdAt: now(),
          updatedAt: now()
        });
      });
      createAuditReceipt(this.db, {
        projectId: project.id,
        actorType: "system",
        channel: "telegram",
        action: "approval.requested",
        targetType: "remediation_job",
        targetId: jobId,
        approvalChannel: "telegram",
        outputSummary: { messageId: result.messageId }
      });
    }
    this.updateJob(jobId, { status: "approval_sent" });
  }

  private remediationContext(project: Project, finding: Finding, vulnerability: Vulnerability) {
    return {
      project: {
        name: project.name,
        sourceType: project.sourceType,
        owner: project.githubOwner,
        repo: project.githubRepo,
        baseBranch: project.githubDefaultBranch
      },
      finding: {
        packageName: finding.packageName,
        ecosystem: finding.ecosystem,
        currentVersion: finding.currentVersion,
        fixedVersion: finding.fixedVersion,
        vulnerabilityIds: [...vulnerability.cveIds, vulnerability.osvId].filter(Boolean),
        summary: vulnerability.summary,
        riskScore: finding.riskScore,
        riskLevel: finding.riskLevel
      },
      constraints: {
        makeSmallestSafeChange: true,
        doNotRefactorUnrelatedCode: true,
        doNotTouchSecrets: true,
        stopBeforeDeployment: true
      },
      validation: {
        install: "npm ci or npm install depending on lockfile",
        test: "npm test when configured",
        build: "npm run build when configured",
        lint: "npm run lint when configured"
      }
    };
  }

  /** Runs the non-SCA scanner matrix and persists findings for the project. Never throws. */
  private runAndStoreScanners(projectId: string, projectPath: string): Record<string, number> {
    const counts: Record<string, number> = {};
    try {
      const results = runProjectScanners(projectPath, projectId, { categories: ["secret", "ci", "agent", "malware", "sast", "container", "iac", "license"] });
      const stored = results.flatMap((result) => result.findings.map((finding) => ({
        id: finding.id,
        projectId,
        scanner: finding.scanner,
        category: finding.category,
        severity: finding.severity,
        title: finding.title,
        description: finding.description,
        evidencePath: finding.evidencePath,
        evidenceLine: finding.evidenceLine,
        redactedEvidence: finding.redactedEvidence,
        packageName: finding.packageName,
        source: finding.source,
        confidence: finding.confidence,
        remediation: finding.remediation,
        createdAt: now()
      })));
      for (const finding of stored) counts[finding.category] = (counts[finding.category] ?? 0) + 1;
      this.db.update((state) => {
        state.scannerFindings = [...(state.scannerFindings ?? []).filter((finding) => finding.projectId !== projectId), ...stored];
      });
    } catch (error) {
      this.event("scan", projectId, "scanner.matrix.error", "warn", "Scanner matrix failed; dependency scan unaffected.", { message: error instanceof Error ? error.message : String(error) });
    }
    return counts;
  }

  private applyDeterministicNpmFix(workspace: string, finding: Finding): string {
    if (!finding.fixedVersion) throw new PatchPilotError("fixed_version_missing", "Deterministic fixer requires a known fixed version.");
    // Multi-ecosystem routing: PyPI edits requirements.txt; npm edits package.json + lockfile.
    if (/^pypi$|^pip$|^python$/i.test(finding.ecosystem)) {
      return this.applyPypiVersionFix(workspace, finding.packageName, finding.fixedVersion);
    }
    return this.applyNpmVersionFix(workspace, finding.packageName, finding.fixedVersion, finding.ecosystem);
  }

  /** PatchPilot-owned safe PyPI update: pins the dependency in requirements.txt. */
  private applyPypiVersionFix(workspace: string, packageName: string, version: string): string {
    const requirementsPath = path.join(workspace, "requirements.txt");
    const updated = updateRequirementsVersion(requirementsPath, packageName, version);
    if (!updated) throw new PatchPilotError("dependency_not_direct", "PatchPilot can only update direct requirements.txt dependencies.", { packageName });
    return `Updated ${packageName} to ${version} in requirements.txt.`;
  }

  /**
   * PatchPilot-owned safe dependency update: edits only package.json and
   * regenerates the lockfile. Used by both the deterministic fixer and the
   * LLM-plan path, so a model's advice is always applied by PatchPilot itself.
   */
  private applyNpmVersionFix(workspace: string, packageName: string, version: string, ecosystem: string): string {
    if (ecosystem !== "npm") throw new PatchPilotError("deterministic_fix_unsupported", "PatchPilot's safe applier currently supports npm findings only.");
    const manifestPath = path.join(workspace, "package.json");
    const updated = updateManifestDependencyVersion(manifestPath, packageName, version);
    if (!updated) throw new PatchPilotError("dependency_not_direct", "PatchPilot can only update direct manifest dependencies.", { packageName });
    const lockUpdate = spawnSync("npm install --package-lock-only --ignore-scripts", { cwd: workspace, encoding: "utf8", shell: true });
    if ((lockUpdate.status ?? 1) !== 0) {
      throw new PatchPilotError("lockfile_update_failed", "npm failed to update the lockfile for the remediation.", { stderr: lockUpdate.stderr });
    }
    return `Updated ${packageName} to ${version} in package.json. Lockfile will be validated by npm install/npm ci.`;
  }

  private updateJob(jobId: string, patch: Partial<RemediationJob>): void {
    this.db.update((state) => {
      const index = state.remediationJobs.findIndex((item) => item.id === jobId);
      if (index >= 0) state.remediationJobs[index] = { ...state.remediationJobs[index]!, ...patch };
    });
  }

  private failRemediation(job: RemediationJob, code: string, message: string, patch: Partial<RemediationJob> = {}): RemediationJob {
    this.updateJob(job.id, { status: patch.status ?? "failed", errorCode: code, errorMessage: message, finishedAt: now(), ...patch });
    this.db.update((state) => {
      const index = state.findings.findIndex((item) => item.id === job.findingId);
      if (index >= 0) state.findings[index] = { ...state.findings[index]!, status: "open", updatedAt: now() };
    });
    this.event("remediation", job.id, "remediation.failed", "error", message, { code });
    createAuditReceipt(this.db, {
      projectId: job.projectId,
      actorType: "system",
      agent: job.agent,
      action: "remediation.failed",
      targetType: "remediation_job",
      targetId: job.id,
      outputSummary: { code, message }
    });
    return this.db.read().remediationJobs.find((item) => item.id === job.id)!;
  }

  private event(jobType: JobEvent["jobType"], jobId: string, type: string, level: JobEvent["level"], message: string, data?: Record<string, unknown>): void {
    this.db.update((state) => {
      state.jobEvents.push({ id: id("evt"), jobType, jobId, type, level, message, data, createdAt: now() });
    });
  }
}

function safeSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "patch";
}

function prBody(input: {
  finding: Finding;
  vulnerability: Vulnerability;
  validationRuns: ValidationRun[];
  receiptId: string;
  confidence: number;
  changedFiles: string[];
}): string {
  return `# PatchPilot security fix

## Finding

- Package: ${input.finding.packageName}
- Current version: ${input.finding.currentVersion}
- Fixed version: ${input.finding.fixedVersion ?? "manual review"}
- Vulnerability: ${[...input.vulnerability.cveIds, input.vulnerability.osvId].filter(Boolean).join(", ")}
- Risk score: ${input.finding.riskScore} / 100 ${input.finding.riskLevel}

## Changed files

${input.changedFiles.map((file) => `- ${file}`).join("\n")}

## Validation

| Command | Result |
|---|---|
${input.validationRuns.map((run) => `| ${run.command} | ${run.status}${typeof run.exitCode === "number" ? ` (${run.exitCode})` : ""} |`).join("\n")}

## Approval

Status: awaiting phone approval

## Audit receipt

Receipt: ${input.receiptId}

## Rollback

Close this draft PR if not merged. If merged, revert the merge commit or this branch commit through normal GitHub controls.

Fix confidence: ${input.confidence}/100
`;
}
