import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { JsonDatabase, PatchPilotService, agentProviderReadiness, createAuditReceipt, detectScannerTools, scannerCoverage, watchStatus } from "@patchpilot/core";

const PROVIDER_ACTIONS = new Set([
  "provider_chain_started", "provider_readiness_checked", "provider_attempt_started",
  "provider_attempt_failed", "provider_attempt_completed", "provider_failover_consent_requested",
  "provider_failover_consent_approved", "provider_failover_consent_rejected",
  "local_model_used", "deterministic_fallback_used"
]);

const db = new JsonDatabase();
const service = new PatchPilotService(db);
const server = new McpServer({ name: "patchpilot", version: "0.1.0" });

server.tool("patchpilot.list_projects", {}, async () => ({
  content: [{ type: "text", text: JSON.stringify(service.listProjects(), null, 2) }]
}));

server.tool("patchpilot.scan_project", { projectId: z.string() }, async ({ projectId }) => ({
  content: [{ type: "text", text: JSON.stringify(await service.scanProject(projectId), null, 2) }]
}));

server.tool("patchpilot.scan_all", {}, async () => ({
  content: [{ type: "text", text: JSON.stringify(await service.scanAll(), null, 2) }]
}));

server.tool("patchpilot.get_threat_radar", {}, async () => ({
  content: [{ type: "text", text: JSON.stringify(service.threatRadar(), null, 2) }]
}));

server.tool("patchpilot.get_blast_radius", {}, async () => ({
  content: [{ type: "text", text: JSON.stringify(service.blastRadius(), null, 2) }]
}));

server.tool("patchpilot.get_vulnerability", { vulnerabilityId: z.string() }, async ({ vulnerabilityId }) => {
  const state = db.read();
  return { content: [{ type: "text", text: JSON.stringify(state.vulnerabilities.find((item) => item.id === vulnerabilityId) ?? null, null, 2) }] };
});

server.tool("patchpilot.create_patch_job", { findingId: z.string(), agent: z.enum(["manual", "deterministic-npm"]).optional() }, async ({ findingId, agent }) => {
  const job = await service.startRemediation(findingId, agent ?? "manual");
  return { content: [{ type: "text", text: JSON.stringify(job, null, 2) }] };
});

server.tool("patchpilot.get_job_status", { jobId: z.string() }, async ({ jobId }) => {
  const state = db.read();
  return { content: [{ type: "text", text: JSON.stringify(state.remediationJobs.find((item) => item.id === jobId) ?? null, null, 2) }] };
});

server.tool("patchpilot.run_validation", { remediationJobId: z.string() }, async ({ remediationJobId }) => ({
  content: [{ type: "text", text: `Validation must run against a concrete workspace through the worker. Job: ${remediationJobId}` }]
}));

server.tool("patchpilot.create_pr", { remediationJobId: z.string() }, async ({ remediationJobId }) => ({
  content: [{ type: "text", text: `GitHub PR creation requires GITHUB_TOKEN and a pushed branch. PatchPilot will not fabricate a PR for ${remediationJobId}.` }]
}));

server.tool("patchpilot.send_approval_request", { remediationJobId: z.string() }, async ({ remediationJobId }) => ({
  content: [{ type: "text", text: `Telegram approval requires TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_CHAT_IDS, and APPROVAL_HMAC_SECRET. Job: ${remediationJobId}` }]
}));

server.tool("patchpilot.record_audit_receipt", { action: z.string(), targetType: z.string(), targetId: z.string() }, async ({ action, targetType, targetId }) => ({
  content: [{ type: "text", text: JSON.stringify(createAuditReceipt(db, { actorType: "mcp", action, targetType, targetId }), null, 2) }]
}));

server.tool("patchpilot.get_audit_receipts", {}, async () => ({
  content: [{ type: "text", text: JSON.stringify(db.read().auditReceipts, null, 2) }]
}));

server.tool("patchpilot.rollback", { remediationJobId: z.string() }, async ({ remediationJobId }) => ({
  content: [{ type: "text", text: JSON.stringify(await service.rollback(remediationJobId), null, 2) }]
}));

// --- Watch Commander command-center tools (real data, no secrets) ---

server.tool("patchpilot.get_provider_readiness", {}, async () => ({
  // agentProviderReadiness exposes env var NAMES only — never secret values.
  content: [{ type: "text", text: JSON.stringify(agentProviderReadiness(), null, 2) }]
}));

server.tool("patchpilot.get_provider_failover_timeline", {}, async () => {
  const timeline = db.read().auditReceipts
    .filter((receipt) => PROVIDER_ACTIONS.has(receipt.action))
    .slice(-30).reverse()
    .map((receipt) => ({ action: receipt.action, at: receipt.createdAt, agent: receipt.agent, summary: receipt.outputSummary }));
  return { content: [{ type: "text", text: JSON.stringify(timeline, null, 2) }] };
});

server.tool("patchpilot.get_scanner_coverage", {}, async () => ({
  content: [{ type: "text", text: JSON.stringify({ coverage: scannerCoverage(), tools: detectScannerTools() }, null, 2) }]
}));

server.tool("patchpilot.get_watch_status", {}, async () => ({
  content: [{ type: "text", text: JSON.stringify(watchStatus(db), null, 2) }]
}));

server.tool("patchpilot.get_approval_queue", {}, async () => {
  const state = db.read();
  const queue = {
    remediationApprovals: state.approvals.filter((approval) => approval.status === "pending"),
    providerConsents: (state.providerConsents ?? []).filter((consent) => consent.status === "pending"),
    watchAlerts: (state.watchAlerts ?? []).slice(-15).reverse()
  };
  return { content: [{ type: "text", text: JSON.stringify(queue, null, 2) }] };
});

server.tool("patchpilot.start_scan", { projectId: z.string() }, async ({ projectId }) => ({
  content: [{ type: "text", text: JSON.stringify(await service.scanProject(projectId), null, 2) }]
}));

server.tool("patchpilot.request_remediation", { findingId: z.string() }, async ({ findingId }) => {
  // Runs the failover ladder; respects consent gates (never silently uses a
  // lower-trust provider, never auto-merges/deploys).
  const result = await service.startGuardedRemediation(findingId);
  return { content: [{ type: "text", text: JSON.stringify({ outcome: result.outcome, decision: result.decision, timeline: result.timeline, jobStatus: result.job?.status, consent: result.consent?.status }, null, 2) }] };
});

server.tool("patchpilot.request_provider_failover", { findingId: z.string() }, async ({ findingId }) => {
  const result = await service.startGuardedRemediation(findingId);
  return { content: [{ type: "text", text: JSON.stringify({ outcome: result.outcome, timeline: result.timeline, consent: result.consent ? { status: result.consent.status, candidateProvider: result.consent.candidateProvider } : undefined }, null, 2) }] };
});

await server.connect(new StdioServerTransport());
