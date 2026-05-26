import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  CODEX_REMEDIATION_PROMPT,
  COMMIT_GITIGNORE_ENTRIES,
  JsonDatabase,
  PatchPilotService,
  assertSafeCommitState,
  assertSafeLocalPath,
  agentProviderReadiness,
  assertLlmProviderConfigured,
  buildLlmChatRequest,
  buildScopedCodexPrompt,
  classifyAgentRemediation,
  classifyCodexRemediation,
  codexExecArgs,
  commitAll,
  diffLockfilePackage,
  parseRemediationPlan,
  resolveAgentProvider,
  updateManifestDependencyVersion,
  createAuditReceipt,
  emptyState,
  enrichVulnerability,
  fixConfidence,
  generateSbom,
  ensureCommitGitignore,
  initBaselineRepo,
  normalizeOsvVulnerability,
  parseOsvScannerJson,
  pluginManifestSchema,
  queryOsvFindings,
  redact,
  runCodexExec,
  runCommand,
  runGit,
  safeNpmInstallCommand,
  scanAgentConfig,
  scoreRisk,
  sendTelegramApproval,
  signApprovalPayload,
  redactTelegramChatId,
  validateTelegramWebhookSecret,
  validatePluginManifest,
  verifyApprovalToken,
  writePatch,
  cleanupWorkspace,
  cloneGithubRepo,
  copyProjectToWorkspace
} from "../index";

function tempRoot() {
  return mkdtempSync(path.join(os.tmpdir(), "patchpilot-test-"));
}

describe("redaction", () => {
  it("redacts known and high entropy secrets without removing normal text", () => {
    const text = "token=ghp_1234567890abcdefghijklmnopqrstuvwxyz and normal package lodash";
    const redacted = redact(text);
    expect(redacted).not.toContain("ghp_1234567890abcdefghijklmnopqrstuvwxyz");
    expect(redacted).toContain("lodash");
  });

  it("redacts .env style values", () => {
    expect(redact("OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456")).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
  });

  it("redacts secret-like log values", () => {
    const output = redact("SECRET_TOKEN=super-secret-token-value\nprivate_key=-----BEGIN_PRIVATE_KEY-----abcdefghi");
    expect(output).not.toContain("super-secret-token-value");
    expect(output).not.toContain("abcdefghi");
  });
});

describe("path safety", () => {
  it("accepts an allowlisted folder", () => {
    const root = tempRoot();
    const child = path.join(root, "project");
    mkdirSync(child);
    expect(assertSafeLocalPath(child, [root])).toBe(child);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects traversal outside allowlist", () => {
    const root = tempRoot();
    const outside = tempRoot();
    expect(() => assertSafeLocalPath(outside, [root])).toThrow(/outside PATCHPILOT_LOCAL_ROOTS/);
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
});

describe("risk score", () => {
  const vulnerability = {
    id: "CVE-TEST",
    source: "osv" as const,
    cveIds: ["CVE-2021-23337"],
    ghsaIds: [],
    summary: "test",
    severity: "high",
    cvssScore: 7.5,
    references: []
  };
  const project = {
    id: "proj",
    name: "api",
    sourceType: "local" as const,
    isPathAllowlisted: true,
    packageManager: "npm" as const,
    deploymentProvider: "manual" as const,
    productionExposed: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  it("raises critical risk for KEV production direct dependency", () => {
    const result = scoreRisk({ vulnerability, project, dependencyType: "direct", fixedVersion: "4.17.21", epssPercentile: 0.96, isInKev: true });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.level).toBe("critical");
  });

  it("records missing EPSS and KEV data", () => {
    const result = scoreRisk({ vulnerability, project: { ...project, productionExposed: false }, dependencyType: "unknown" });
    expect(result.missing.join(" ")).toContain("EPSS");
    expect(result.missing.join(" ")).toContain("Dependency depth unknown");
  });
});

describe("fix confidence", () => {
  it("penalizes failed validation", () => {
    expect(fixConfidence({
      minimalVersionBump: true,
      lockfileUpdated: true,
      testsPassed: false,
      buildPassed: false,
      unrelatedFilesChanged: false,
      secretsTouched: false,
      smallDiff: true,
      missingTests: false,
      missingBuild: false,
      majorUpgrade: false,
      validationSkipped: false,
      newInstallScripts: false,
      validationFailed: true
    })).toBeLessThanOrEqual(40);
  });
});

describe("approval HMAC", () => {
  it("accepts valid tokens and rejects modified tokens", () => {
    const token = signApprovalPayload({ approvalId: "appr_1", action: "approve", exp: 9999999999 }, "secret");
    expect(verifyApprovalToken(token, "secret").approvalId).toBe("appr_1");
    const [payload, sig] = token.split(".");
    const tamperedPayload = Buffer.from(JSON.stringify({ approvalId: "appr_1", action: "reject", exp: 9999999999 })).toString("base64url");
    expect(() => verifyApprovalToken(`${tamperedPayload}.${sig}`, "secret")).toThrow();
  });

  it("rejects expired tokens", () => {
    const token = signApprovalPayload({ approvalId: "appr_1", action: "approve", exp: 1 }, "secret");
    expect(() => verifyApprovalToken(token, "secret", 2)).toThrow(/expired/);
  });
});

describe("audit receipts", () => {
  it("creates a hash chain", () => {
    const root = tempRoot();
    const db = new JsonDatabase(path.join(root, "db.json"));
    db.write(emptyState());
    const first = createAuditReceipt(db, { actorType: "system", action: "scan.started", targetType: "scan", targetId: "1" });
    const second = createAuditReceipt(db, { actorType: "system", action: "scan.completed", targetType: "scan", targetId: "1" });
    expect(second.previousReceiptHash).toBe(first.receiptHash);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("OSV normalization", () => {
  it("normalizes a lodash fixture response", () => {
    const finding = normalizeOsvVulnerability({
      id: "GHSA-35jh-r3h4-6jhm",
      aliases: ["CVE-2021-23337"],
      summary: "lodash command injection",
      affected: [{ ranges: [{ events: [{ introduced: "0" }, { fixed: "4.17.21" }] }] }]
    }, "lodash", "4.17.20", "direct");
    expect(finding.fixedVersion).toBe("4.17.21");
    expect(finding.vulnerability.cveIds).toContain("CVE-2021-23337");
  });
});

describe("agent supply-chain scanner", () => {
  it("finds dangerous codex and env files with redaction", () => {
    const root = tempRoot();
    mkdirSync(path.join(root, ".codex"), { recursive: true });
    writeFileSync(path.join(root, ".codex", "config.toml"), "sandbox_mode = \"danger-full-access\"");
    writeFileSync(path.join(root, ".env"), "SECRET=super-secret-value");
    const findings = scanAgentConfig(root, "proj");
    expect(findings.some((finding) => finding.reason.includes("full filesystem"))).toBe(true);
    expect(findings.some((finding) => finding.filePath === ".env")).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("warns on npm lifecycle scripts", () => {
    const root = tempRoot();
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { postinstall: "node postinstall.js" } }));
    const findings = scanAgentConfig(root, "proj");
    expect(findings.some((finding) => finding.reason.includes("postinstall"))).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });
});

describe("workspace and patch artifacts", () => {
  it("excludes secret-like files from Codex workspaces", () => {
    const source = tempRoot();
    const destination = tempRoot();
    writeFileSync(path.join(source, "package.json"), "{}");
    writeFileSync(path.join(source, ".env"), "TOKEN=super-secret-token-value");
    writeFileSync(path.join(source, ".env.local"), "TOKEN=super-secret-token-value");
    writeFileSync(path.join(source, "deploy.pem"), "private");
    writeFileSync(path.join(source, "api-token.json"), "{}");
    copyProjectToWorkspace(source, destination);
    expect(existsSync(path.join(destination, "package.json"))).toBe(true);
    expect(existsSync(path.join(destination, ".env"))).toBe(false);
    expect(existsSync(path.join(destination, ".env.local"))).toBe(false);
    expect(existsSync(path.join(destination, "deploy.pem"))).toBe(false);
    expect(existsSync(path.join(destination, "api-token.json"))).toBe(false);
    rmSync(source, { recursive: true, force: true });
    rmSync(destination, { recursive: true, force: true });
  });

  it("writes local patch artifacts with tracked changes and untracked lockfiles", () => {
    const root = tempRoot();
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ dependencies: { lodash: "4.17.20" } }, null, 2));
    initBaselineRepo(root);
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ dependencies: { lodash: "4.17.21" } }, null, 2));
    writeFileSync(path.join(root, "package-lock.json"), JSON.stringify({ name: "fixture", lockfileVersion: 3 }, null, 2));
    const patchPath = writePatch(root, "rem_test");
    const patch = readFileSync(patchPath, "utf8");
    expect(patch).toContain("package.json");
    expect(patch).toContain("package-lock.json");
    rmSync(root, { recursive: true, force: true });
  });

  it("keeps validation artifacts out of remediation commits", () => {
    const root = tempRoot();
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ dependencies: { lodash: "4.17.20" } }, null, 2));
    initBaselineRepo(root);
    ensureCommitGitignore(root);
    mkdirSync(path.join(root, "node_modules", "lodash"), { recursive: true });
    writeFileSync(path.join(root, "node_modules", "lodash", "index.js"), "module.exports = {};");
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ dependencies: { lodash: "4.17.21" } }, null, 2));
    const files = ["package.json", ".gitignore"];
    commitAll(root, "fix fixture", files);
    const committed = runGit(["show", "--name-only", "--format="], root).stdout.split(/\r?\n/).filter(Boolean);
    expect(committed).toContain("package.json");
    expect(committed).toContain(".gitignore");
    expect(committed.some((file) => file.startsWith("node_modules/"))).toBe(false);
    const gitignore = readFileSync(path.join(root, ".gitignore"), "utf8");
    for (const entry of COMMIT_GITIGNORE_ENTRIES) expect(gitignore).toContain(entry);
    rmSync(root, { recursive: true, force: true });
  });

  it("aborts PR-ready commits when node_modules is staged or changed", () => {
    const root = tempRoot();
    writeFileSync(path.join(root, "package.json"), "{}");
    initBaselineRepo(root);
    mkdirSync(path.join(root, "node_modules", "lodash"), { recursive: true });
    writeFileSync(path.join(root, "node_modules", "lodash", "index.js"), "module.exports = {};");
    runGit(["add", "-f", "node_modules/lodash/index.js"], root);
    expect(() => assertSafeCommitState(root)).toThrow(/Unsafe generated or secret-like files/);
    expect(() => commitAll(root, "unsafe")).toThrow(/Unsafe generated or secret-like files/);
    rmSync(root, { recursive: true, force: true });
  });

  it("cleans workspaces by default and retains them only when explicitly configured", () => {
    const root = tempRoot();
    const first = path.join(root, "first");
    const second = path.join(root, "second");
    mkdirSync(first);
    mkdirSync(second);
    cleanupWorkspace(first);
    expect(existsSync(first)).toBe(false);
    vi.stubEnv("PATCHPILOT_RETAIN_WORKSPACES", "true");
    cleanupWorkspace(second);
    expect(existsSync(second)).toBe(true);
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });
});

describe("rollback states", () => {
  it("does not roll back local patch artifacts before they are applied", async () => {
    const root = tempRoot();
    const db = new JsonDatabase(path.join(root, "db.json"));
    const projectRoot = path.join(root, "project");
    mkdirSync(projectRoot);
    db.write({
      ...emptyState(),
      projects: [{
        id: "proj",
        name: "fixture",
        sourceType: "local",
        localPath: projectRoot,
        isPathAllowlisted: true,
        packageManager: "npm",
        deploymentProvider: "none",
        productionExposed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }],
      remediationJobs: [{
        id: "rem",
        findingId: "find",
        projectId: "proj",
        status: "pr_ready",
        agent: "deterministic-npm",
        changedFiles: ["package.json"],
        patchPath: path.join(root, "missing.patch"),
        rollbackStatus: "not_available",
        createdAt: new Date().toISOString()
      }]
    });
    await expect(new PatchPilotService(db).rollback("rem")).rejects.toThrow(/Rollback is not available/);
    expect(db.read().remediationJobs[0]?.rollbackStatus).toBe("not_available");
    rmSync(root, { recursive: true, force: true });
  });

  it("rolls back an applied local patch with the stored reverse patch", async () => {
    const root = tempRoot();
    const workspace = path.join(root, "workspace");
    const projectRoot = path.join(root, "project");
    mkdirSync(workspace);
    mkdirSync(projectRoot);
    writeFileSync(path.join(workspace, "package.json"), "{\"dependencies\":{\"lodash\":\"4.17.20\"}}\n");
    initBaselineRepo(workspace);
    writeFileSync(path.join(workspace, "package.json"), "{\"dependencies\":{\"lodash\":\"4.17.21\"}}\n");
    const patchPath = writePatch(workspace, "rem_applied");
    writeFileSync(path.join(projectRoot, "package.json"), "{\"dependencies\":{\"lodash\":\"4.17.21\"}}\n");
    runGit(["init"], projectRoot);
    const db = new JsonDatabase(path.join(root, "db.json"));
    db.write({
      ...emptyState(),
      projects: [{
        id: "proj",
        name: "fixture",
        sourceType: "local",
        localPath: projectRoot,
        isPathAllowlisted: true,
        packageManager: "npm",
        deploymentProvider: "none",
        productionExposed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }],
      remediationJobs: [{
        id: "rem",
        findingId: "find",
        projectId: "proj",
        status: "approved",
        agent: "deterministic-npm",
        changedFiles: ["package.json"],
        patchPath,
        patchAppliedAt: new Date().toISOString(),
        rollbackStatus: "available",
        createdAt: new Date().toISOString()
      }]
    });
    const rolledBack = await new PatchPilotService(db).rollback("rem");
    expect(rolledBack.rollbackStatus).toBe("completed");
    expect(readFileSync(path.join(projectRoot, "package.json"), "utf8")).toContain("4.17.20");
    rmSync(root, { recursive: true, force: true });
  });
});

describe("validation runner", () => {
  it("captures successful command result", async () => {
    const root = tempRoot();
    const result = await runCommand("node -e \"console.log('ok')\"", root, "rem_test", 5000);
    expect(result.status).toBe("passed");
    rmSync(root, { recursive: true, force: true });
  });

  it("captures failed command result", async () => {
    const root = tempRoot();
    const result = await runCommand("node -e \"process.exit(2)\"", root, "rem_test", 5000);
    expect(result.status).toBe("failed");
    expect(result.exitCode).toBe(2);
    rmSync(root, { recursive: true, force: true });
  });

  it("uses npm install safe mode unless lifecycle scripts are explicitly allowed", () => {
    vi.unstubAllEnvs();
    expect(safeNpmInstallCommand(true)).toBe("npm ci --ignore-scripts");
    expect(safeNpmInstallCommand(false)).toBe("npm install --ignore-scripts");
    vi.stubEnv("PATCHPILOT_ALLOW_VALIDATION_SCRIPTS", "true");
    expect(safeNpmInstallCommand(true)).toBe("npm ci");
    vi.unstubAllEnvs();
  });
});

describe("Codex execution safety", () => {
  it("fails clearly when Codex is unavailable", () => {
    const root = tempRoot();
    vi.stubEnv("CODEX_BIN", "definitely-not-installed-codex");
    expect(() => runCodexExec(root)).toThrow(/Codex not executed/);
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it("passes multiline prompts through stdin instead of splitting them into CLI arguments", () => {
    const root = tempRoot();
    const fake = path.join(root, process.platform === "win32" ? "fake-codex.cmd" : "fake-codex.sh");
    const fakeJs = path.join(root, "fake-codex.js");
    writeFileSync(fakeJs, `
const fs = require("fs");
const args = process.argv.slice(2);
if (args[0] === "exec" && args[1] === "--help") {
  console.log("--sandbox");
  console.log("--ephemeral");
  console.log("--ask-for-approval");
  process.exit(0);
}
const workspace = args[args.indexOf("--cd") + 1];
let input = "";
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  fs.writeFileSync(require("path").join(workspace, "codex-args.json"), JSON.stringify(args));
  fs.writeFileSync(require("path").join(workspace, "codex-stdin.txt"), input);
});
`);
    if (process.platform === "win32") {
      writeFileSync(fake, `@echo off\r\nnode "${fakeJs}" %*\r\n`);
    } else {
      writeFileSync(fake, `#!/usr/bin/env sh\nnode "${fakeJs}" "$@"\n`);
      chmodSync(fake, 0o755);
    }
    vi.stubEnv("CODEX_BIN", fake);
    const prompt = "line one\nline two are still one prompt";
    const result = runCodexExec(root, prompt);
    expect(result.status).toBe(0);
    const args = JSON.parse(readFileSync(path.join(root, "codex-args.json"), "utf8")) as string[];
    expect(args[0]).toBe("exec");
    expect(args[1]).toBe("--cd");
    expect(args[2]).toBe(root);
    expect(args).toContain("--sandbox");
    expect(args).toContain("workspace-write");
    expect(codexExecArgs(root, ["--sandbox", "workspace-write"]).at(-1)).toBe("-");
    expect(args).toContain("-");
    expect(args.some((arg) => arg.includes("line two are"))).toBe(false);
    expect(readFileSync(path.join(root, "codex-stdin.txt"), "utf8")).toBe(prompt);
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it("returns a timeout result when Codex exceeds the configured timeout", () => {
    const root = tempRoot();
    const fake = path.join(root, process.platform === "win32" ? "fake-codex.cmd" : "fake-codex.sh");
    if (process.platform === "win32") {
      writeFileSync(fake, "@echo off\r\nif \"%~2\"==\"--help\" goto help\r\nping -n 3 127.0.0.1 > nul\r\nexit /b 0\r\n:help\r\necho --sandbox\r\necho --ephemeral\r\nexit /b 0\r\n");
    } else {
      writeFileSync(fake, "#!/usr/bin/env sh\nif [ \"$1\" = \"exec\" ] && [ \"$2\" = \"--help\" ]; then echo --sandbox; echo --ephemeral; exit 0; fi\nsleep 3\n");
      chmodSync(fake, 0o755);
    }
    vi.stubEnv("CODEX_BIN", fake);
    vi.stubEnv("CODEX_TIMEOUT_MS", "50");
    const result = runCodexExec(root);
    expect(result.status).toBe(124);
    expect(result.stderr).toContain("timed out");
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it("returns a non-zero result when Codex exits unsuccessfully", () => {
    const root = tempRoot();
    const fake = path.join(root, process.platform === "win32" ? "fake-codex.cmd" : "fake-codex.sh");
    if (process.platform === "win32") {
      writeFileSync(fake, "@echo off\r\nif \"%~2\"==\"--help\" goto help\r\nexit /b 7\r\n:help\r\necho --sandbox\r\necho --ephemeral\r\nexit /b 0\r\n");
    } else {
      writeFileSync(fake, "#!/usr/bin/env sh\nif [ \"$1\" = \"exec\" ] && [ \"$2\" = \"--help\" ]; then echo --sandbox; echo --ephemeral; exit 0; fi\nexit 7\n");
      chmodSync(fake, 0o755);
    }
    vi.stubEnv("CODEX_BIN", fake);
    const result = runCodexExec(root, "prompt");
    expect(result.status).toBe(7);
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });
});

describe("scoped Codex remediation", () => {
  const scoped = buildScopedCodexPrompt({ packageName: "lodash", currentVersion: "4.17.20", fixedVersion: "4.17.21" });

  it("builds a small bounded prompt that only edits package.json", () => {
    expect(scoped).toContain("lodash moves from 4.17.20 to 4.17.21");
    expect(scoped).toContain("Change only package.json");
    expect(scoped).toContain("Stop after the edit");
    // A bounded edit prompt should stay short.
    expect(scoped.length).toBeLessThan(CODEX_REMEDIATION_PROMPT.length);
  });

  it("does not ask Codex to run npm install, test, or build", () => {
    expect(scoped).toContain("Do not run commands");
    expect(scoped).not.toMatch(/npm (install|ci|test|run build)/i);
    expect(scoped.toLowerCase()).not.toContain("validation");
    // PatchPilot, not Codex, owns install/test/build. The broad prompt is the one
    // that tells the agent to run validation commands.
    expect(CODEX_REMEDIATION_PROMPT).toContain("Run the validation commands");
  });

  it("delivers the scoped prompt as a single stdin input, never split into args", () => {
    const root = tempRoot();
    const fake = path.join(root, process.platform === "win32" ? "fake-codex.cmd" : "fake-codex.sh");
    const fakeJs = path.join(root, "fake-codex.js");
    writeFileSync(fakeJs, `
const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
if (args[0] === "exec" && args[1] === "--help") {
  console.log("--sandbox");
  console.log("--ephemeral");
  process.exit(0);
}
const workspace = args[args.indexOf("--cd") + 1];
let input = "";
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  fs.writeFileSync(path.join(workspace, "codex-args.json"), JSON.stringify(args));
  fs.writeFileSync(path.join(workspace, "codex-stdin.txt"), input);
});
`);
    if (process.platform === "win32") {
      writeFileSync(fake, `@echo off\r\nnode "${fakeJs}" %*\r\n`);
    } else {
      writeFileSync(fake, `#!/usr/bin/env sh\nnode "${fakeJs}" "$@"\n`);
      chmodSync(fake, 0o755);
    }
    vi.stubEnv("CODEX_BIN", fake);
    const multiline = `${scoped}\nsecond bounded line stays in the same prompt`;
    const result = runCodexExec(root, multiline);
    expect(result.status).toBe(0);
    expect(typeof result.durationMs).toBe("number");
    const args = JSON.parse(readFileSync(path.join(root, "codex-args.json"), "utf8")) as string[];
    expect(args).toContain("--sandbox");
    expect(args).toContain("workspace-write");
    expect(args.at(-1)).toBe("-");
    expect(args.some((arg) => arg.includes("bounded line"))).toBe(false);
    expect(readFileSync(path.join(root, "codex-stdin.txt"), "utf8")).toBe(multiline);
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });
});

describe("Codex remediation outcome classification", () => {
  it("treats a timeout as a deterministic fallback, not a Codex completion", () => {
    const outcome = classifyCodexRemediation({ status: "failed", errorCode: "codex_timeout", changedFiles: [] });
    expect(outcome.codexStatus).toBe("timeout");
    expect(outcome.codexCompleted).toBe(false);
    expect(outcome.shouldFallback).toBe(true);
  });

  it("treats unavailable Codex as a fallback", () => {
    expect(classifyCodexRemediation({ status: "codex_not_executed", errorCode: "codex_unavailable" })).toMatchObject({
      codexStatus: "unavailable",
      codexCompleted: false,
      shouldFallback: true
    });
  });

  it("marks real Codex completion only when file changes are detected", () => {
    const completed = classifyCodexRemediation({ status: "approval_sent", changedFiles: ["package.json", "package-lock.json"] });
    expect(completed).toMatchObject({ codexStatus: "completed", codexCompleted: true, shouldFallback: false });

    // PR-ready status with no detected changes must not be reported as completion.
    const noChanges = classifyCodexRemediation({ status: "pr_ready", changedFiles: [] });
    expect(noChanges.codexCompleted).toBe(false);
    expect(noChanges.shouldFallback).toBe(true);
  });
});

describe("BYO agent provider layer", () => {
  const expected = { packageName: "lodash", fromVersion: "4.17.20", fixedVersion: "4.17.21" };
  const validPlan = JSON.stringify({
    action: "update_dependency",
    ecosystem: "npm",
    file: "package.json",
    packageName: "lodash",
    fromVersion: "4.17.20",
    toVersion: "4.17.21",
    summary: "Bump lodash to the fixed version."
  });

  it("selects the configured provider and defaults to codex", () => {
    vi.unstubAllEnvs();
    expect(resolveAgentProvider()).toBe("codex");
    vi.stubEnv("PATCHPILOT_AGENT_PROVIDER", "openrouter");
    expect(resolveAgentProvider()).toBe("openrouter");
    expect(agentProviderReadiness().find((provider) => provider.selected)?.id).toBe("openrouter");
    vi.stubEnv("PATCHPILOT_AGENT_PROVIDER", "not-a-provider");
    expect(() => resolveAgentProvider()).toThrow(/Unknown PATCHPILOT_AGENT_PROVIDER/);
    vi.unstubAllEnvs();
  });

  it("requires API keys / base URL before any LLM call", () => {
    vi.unstubAllEnvs();
    vi.stubEnv("PATCHPILOT_LLM_API_KEY", "");
    expect(() => assertLlmProviderConfigured("openrouter")).toThrow(/PATCHPILOT_LLM_API_KEY/);
    expect(() => assertLlmProviderConfigured("openai-compatible")).toThrow(/PATCHPILOT_LLM_BASE_URL/);
    // ollama needs no key.
    expect(() => assertLlmProviderConfigured("ollama")).not.toThrow();
    vi.unstubAllEnvs();
  });

  it("constructs an OpenAI-compatible chat request", () => {
    vi.unstubAllEnvs();
    vi.stubEnv("PATCHPILOT_LLM_BASE_URL", "https://llm.example.test/v1/");
    vi.stubEnv("PATCHPILOT_LLM_API_KEY", "llm-secret-key-value");
    vi.stubEnv("PATCHPILOT_AGENT_MODEL", "test-model");
    const request = buildLlmChatRequest("openai-compatible", { finding: "lodash" });
    expect(request.url).toBe("https://llm.example.test/v1/chat/completions");
    expect(request.body.model).toBe("test-model");
    expect(request.body.response_format).toEqual({ type: "json_object" });
    expect(request.body.messages.map((message) => message.role)).toEqual(["system", "user"]);
    expect(request.headers.authorization?.startsWith("Bearer ")).toBe(true);
    vi.unstubAllEnvs();
  });

  it("parses a strict JSON plan, tolerating code fences", () => {
    const plan = parseRemediationPlan("```json\n" + validPlan + "\n```", expected);
    expect(plan.toVersion).toBe("4.17.21");
    expect(plan.file).toBe("package.json");
  });

  it("rejects invalid model output", () => {
    expect(() => parseRemediationPlan("not json at all", expected)).toThrow(/valid JSON/);
    const wrongAction = JSON.stringify({ ...JSON.parse(validPlan), action: "delete_repo" });
    expect(() => parseRemediationPlan(wrongAction, expected)).toThrow();
    const major = JSON.stringify({ ...JSON.parse(validPlan), toVersion: "5.0.0" });
    expect(() => parseRemediationPlan(major, expected)).toThrow(/major-version/);
    const below = JSON.stringify({ ...JSON.parse(validPlan), toVersion: "4.17.20" });
    expect(() => parseRemediationPlan(below, expected)).toThrow(/upgrade/);
  });

  it("rejects plans that contain arbitrary commands", () => {
    const withCommand = JSON.stringify({ ...JSON.parse(validPlan), commands: ["rm -rf /"] });
    expect(() => parseRemediationPlan(withCommand, expected)).toThrow(/command/);
  });

  it("rejects plans that target a forbidden file", () => {
    const forbidden = JSON.stringify({ ...JSON.parse(validPlan), file: "package-lock.json" });
    expect(() => parseRemediationPlan(forbidden, expected)).toThrow(/package\.json/);
  });

  it("applies a safe dependency version update to package.json only", () => {
    const root = tempRoot();
    const manifestPath = path.join(root, "package.json");
    writeFileSync(manifestPath, JSON.stringify({ dependencies: { lodash: "4.17.20" }, devDependencies: { left: "1.0.0" } }, null, 2));
    const plan = parseRemediationPlan(validPlan, expected);
    expect(updateManifestDependencyVersion(manifestPath, plan.packageName, plan.toVersion)).toBe(true);
    const written = JSON.parse(readFileSync(manifestPath, "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    expect(written.dependencies.lodash).toBe("4.17.21");
    expect(written.devDependencies.left).toBe("1.0.0");
    expect(updateManifestDependencyVersion(manifestPath, "not-present", "9.9.9")).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("records fallback status honestly and never fakes provider completion", () => {
    expect(classifyAgentRemediation({ status: "failed", errorCode: "llm_request_failed", changedFiles: [] })).toMatchObject({ status: "failed", completed: false, shouldFallback: true });
    expect(classifyAgentRemediation({ status: "failed", errorCode: "llm_api_key_missing" })).toMatchObject({ status: "not_configured", completed: false, shouldFallback: true });
    expect(classifyAgentRemediation({ status: "failed", errorCode: "llm_timeout" })).toMatchObject({ status: "timeout", shouldFallback: true });
    expect(classifyAgentRemediation({ status: "pr_ready", changedFiles: ["package.json"] })).toMatchObject({ status: "completed", completed: true, shouldFallback: false });
    // Ready status without detected changes is never a completion.
    expect(classifyAgentRemediation({ status: "pr_ready", changedFiles: [] }).completed).toBe(false);
  });

  it("exposes provider readiness without leaking secret values", () => {
    vi.unstubAllEnvs();
    vi.stubEnv("PATCHPILOT_LLM_API_KEY", "super-secret-llm-key-value-123");
    vi.stubEnv("PATCHPILOT_LLM_BASE_URL", "https://private.example.test/v1");
    const serialized = JSON.stringify(agentProviderReadiness());
    expect(serialized).not.toContain("super-secret-llm-key-value-123");
    expect(serialized).not.toContain("private.example.test");
    expect(serialized).toContain("PATCHPILOT_LLM_API_KEY");
    expect(serialized).toContain("openrouter");
    vi.unstubAllEnvs();
  });

  it("diffs a package-lock before/after for the vulnerable package", () => {
    const before = JSON.stringify({ packages: { "node_modules/lodash": { version: "4.17.20" } } });
    const after = JSON.stringify({ packages: { "node_modules/lodash": { version: "4.17.21" } } });
    expect(diffLockfilePackage(before, after, "lodash")).toEqual({ packageName: "lodash", before: "4.17.20", after: "4.17.21", changed: true });
    expect(diffLockfilePackage(before, before, "lodash").changed).toBe(false);
  });
});

describe("Telegram webhook secret", () => {
  it("allows webhooks when the configured secret matches", () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "telegram-secret");
    expect(() => validateTelegramWebhookSecret("telegram-secret")).not.toThrow();
    vi.unstubAllEnvs();
  });

  it("rejects missing and invalid webhook secrets", () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "telegram-secret");
    expect(() => validateTelegramWebhookSecret(undefined)).toThrow(/required/);
    expect(() => validateTelegramWebhookSecret("wrong")).toThrow(/invalid/);
    vi.unstubAllEnvs();
  });
});

describe("Telegram sendMessage", () => {
  it("sends a minimal plain text live test with a mocked Telegram response", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "telegram-token-value");
    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.text).toBe("PatchPilot Telegram live test");
      expect(body.reply_markup).toBeUndefined();
      return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendTelegramApproval({ chatId: "123456789", text: "PatchPilot Telegram live test" })).resolves.toEqual({ messageId: "42" });
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("surfaces Telegram non-ok bodies with redacted chat metadata", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "telegram-token-value");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, error_code: 400, description: "Bad Request: chat not found" }), { status: 400 })));
    await expect(sendTelegramApproval({ chatId: "123456789", text: "hello" })).rejects.toMatchObject({
      code: "telegram_send_failed",
      details: {
        method: "sendMessage",
        error_code: 400,
        description: "Bad Request: chat not found",
        chat_id: "***6789"
      }
    });
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("redacts chat ids and never includes the bot token in error details", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "telegram-token-value");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, error_code: 403, description: "Forbidden" }), { status: 403 })));
    expect(redactTelegramChatId("-1001234567890")).toBe("***7890");
    try {
      await sendTelegramApproval({ chatId: "-1001234567890", text: "hello" });
      throw new Error("expected Telegram send failure");
    } catch (error) {
      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain("telegram-token-value");
      expect(serialized).toContain("***7890");
    }
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("constructs full approval messages as plain text without callback payload limits", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "telegram-token-value");
    const token = signApprovalPayload({ approvalId: "appr_test", action: "approve", exp: 9999999999 }, "secret");
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.text).toContain("PatchPilot live verification approval request");
      expect(body.text).toContain(token);
      expect(body.reply_markup).toBeUndefined();
      return new Response(JSON.stringify({ ok: true, result: { message_id: 43 } }), { status: 200 });
    }));
    await expect(sendTelegramApproval({
      chatId: "123456789",
      text: ["PatchPilot live verification approval request", `Signed approval token: ${token}`].join("\n")
    })).resolves.toEqual({ messageId: "43" });
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});

describe("GitHub scanning", () => {
  it("fails with a missing GitHub token before scanning remote GitHub repos", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("GITHUB_TOKEN", "");
    const root = tempRoot();
    const db = new JsonDatabase(path.join(root, "db.json"));
    db.write({
      ...emptyState(),
      projects: [{
        id: "proj",
        name: "owner/repo",
        sourceType: "github",
        githubOwner: "owner",
        githubRepo: "repo",
        githubDefaultBranch: "main",
        isPathAllowlisted: false,
        packageManager: "unknown",
        deploymentProvider: "none",
        productionExposed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }]
    });
    await expect(new PatchPilotService(db).scanProject("proj")).rejects.toThrow(/GITHUB_TOKEN/);
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it("clones a configured GitHub project and scans real repository contents", async () => {
    const root = tempRoot();
    const repo = path.join(root, "repo");
    mkdirSync(repo);
    writeFileSync(path.join(repo, "package.json"), JSON.stringify({ dependencies: { lodash: "4.17.20" } }, null, 2));
    runGit(["init"], repo);
    runGit(["config", "user.email", "patchpilot@example.invalid"], repo);
    runGit(["config", "user.name", "PatchPilot"], repo);
    runGit(["add", "-A"], repo);
    runGit(["commit", "-m", "initial"], repo);
    runGit(["branch", "-M", "main"], repo);
    const fetchMock = vi.fn(async (url: string | URL) => {
      const value = String(url);
      if (value.includes("/vulns/OSV-TEST")) {
        return new Response(JSON.stringify({ id: "OSV-TEST", aliases: [], summary: "fixture", affected: [{ ranges: [{ events: [{ introduced: "0" }, { fixed: "4.17.21" }] }] }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ results: [{ vulns: [{ id: "OSV-TEST" }] }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("PATCHPILOT_DISABLE_OSV_SCANNER", "true");
    const db = new JsonDatabase(path.join(root, "db.json"));
    db.write({
      ...emptyState(),
      projects: [{
        id: "proj",
        name: "owner/repo",
        sourceType: "github",
        githubOwner: "owner",
        githubRepo: "repo",
        githubDefaultBranch: "main",
        repoUrl: repo,
        isPathAllowlisted: false,
        packageManager: "unknown",
        deploymentProvider: "none",
        productionExposed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }]
    });
    const scan = await new PatchPilotService(db).scanProject("proj");
    expect(scan.status).toBe("completed");
    expect(db.read().findings[0]?.packageName).toBe("lodash");
    expect(db.read().findings[0]?.scanConfidence).toBe("direct_manifest_only");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it("scrubs GitHub remotes after clone", () => {
    const root = tempRoot();
    const repo = path.join(root, "repo");
    const workspace = path.join(root, "workspace");
    mkdirSync(repo);
    writeFileSync(path.join(repo, "package.json"), "{}");
    runGit(["init"], repo);
    runGit(["config", "user.email", "patchpilot@example.invalid"], repo);
    runGit(["config", "user.name", "PatchPilot"], repo);
    runGit(["add", "-A"], repo);
    runGit(["commit", "-m", "initial"], repo);
    runGit(["branch", "-M", "main"], repo);
    cloneGithubRepo({ owner: "owner", repo: "repo", branch: "main", workspace, remoteUrl: repo });
    const remote = runGit(["remote", "get-url", "origin"], workspace).stdout.trim();
    expect(remote).toBe("https://github.com/owner/repo.git");
    expect(readFileSync(path.join(workspace, ".git", "config"), "utf8")).not.toContain("x-access-token");
    rmSync(root, { recursive: true, force: true });
  });

  it("retains GitHub scan workspaces safely when retention is enabled", async () => {
    const root = tempRoot();
    const repo = path.join(root, "repo");
    const workspaces = path.join(root, "workspaces");
    mkdirSync(repo);
    writeFileSync(path.join(repo, "package.json"), JSON.stringify({ dependencies: { lodash: "4.17.20" } }, null, 2));
    runGit(["init"], repo);
    runGit(["config", "user.email", "patchpilot@example.invalid"], repo);
    runGit(["config", "user.name", "PatchPilot"], repo);
    runGit(["add", "-A"], repo);
    runGit(["commit", "-m", "initial"], repo);
    runGit(["branch", "-M", "main"], repo);
    vi.stubEnv("PATCHPILOT_WORKSPACE_DIR", workspaces);
    vi.stubEnv("PATCHPILOT_RETAIN_WORKSPACES", "true");
    vi.stubEnv("PATCHPILOT_DISABLE_OSV_SCANNER", "true");
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const value = String(url);
      if (value.includes("/vulns/OSV-TEST")) return new Response(JSON.stringify({ id: "OSV-TEST", aliases: [], summary: "fixture", affected: [] }), { status: 200 });
      return new Response(JSON.stringify({ results: [{ vulns: [{ id: "OSV-TEST" }] }] }), { status: 200 });
    }));
    const db = new JsonDatabase(path.join(root, "db.json"));
    db.write({
      ...emptyState(),
      projects: [{
        id: "proj",
        name: "owner/repo",
        sourceType: "github",
        githubOwner: "owner",
        githubRepo: "repo",
        githubDefaultBranch: "main",
        repoUrl: repo,
        isPathAllowlisted: false,
        packageManager: "unknown",
        deploymentProvider: "none",
        productionExposed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }]
    });
    await new PatchPilotService(db).scanProject("proj");
    const retained = readdirSync(workspaces).filter((entry) => entry.startsWith("scan_proj_"));
    expect(retained.length).toBe(1);
    const config = readFileSync(path.join(workspaces, retained[0]!, ".git", "config"), "utf8");
    expect(config).not.toContain("x-access-token");
    expect(config).toContain("https://github.com/owner/repo.git");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });
});

describe("OSV scanner parsing", () => {
  it("marks lockfile scanner findings as direct or transitive from scanner JSON", () => {
    const root = tempRoot();
    const manifest = {
      name: "fixture",
      packageManager: "npm" as const,
      dependencies: { lodash: "4.17.20" },
      devDependencies: {},
      optionalDependencies: {},
      scripts: {},
      manifestPath: path.join(root, "package.json"),
      lockfilePath: path.join(root, "package-lock.json"),
      stack: ["node", "npm"]
    };
    const findings = parseOsvScannerJson(JSON.stringify({
      results: [{ packages: [
        { package: { name: "lodash", version: "4.17.20", ecosystem: "npm" }, vulnerabilities: [{ id: "OSV-DIRECT", aliases: [], affected: [] }] },
        { package: { name: "minimist", version: "0.0.8", ecosystem: "npm" }, vulnerabilities: [{ id: "OSV-TRANSITIVE", aliases: [], affected: [] }] }
      ] }]
    }), manifest);
    expect(findings.find((finding) => finding.packageName === "lodash")?.dependencyType).toBe("direct");
    expect(findings.find((finding) => finding.packageName === "minimist")?.dependencyType).toBe("transitive");
    rmSync(root, { recursive: true, force: true });
  });

  it("reports direct_manifest_only confidence when OSV-Scanner is disabled", async () => {
    const root = tempRoot();
    const manifest = {
      name: "fixture",
      packageManager: "npm" as const,
      dependencies: { lodash: "4.17.20" },
      devDependencies: {},
      optionalDependencies: {},
      scripts: {},
      manifestPath: path.join(root, "package.json"),
      stack: ["node", "npm"]
    };
    vi.stubEnv("PATCHPILOT_DISABLE_OSV_SCANNER", "true");
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const value = String(url);
      if (value.includes("/vulns/OSV-TEST")) return new Response(JSON.stringify({ id: "OSV-TEST", aliases: [], summary: "fixture", affected: [] }), { status: 200 });
      return new Response(JSON.stringify({ results: [{ vulns: [{ id: "OSV-TEST" }] }] }), { status: 200 });
    }));
    const result = await queryOsvFindings(root, manifest);
    expect(result.scanner).toBe("osv-api");
    expect(result.scanConfidence).toBe("direct_manifest_only");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it("reports lockfile confidence only when OSV-Scanner actually runs", async () => {
    const root = tempRoot();
    const binDir = path.join(root, "bin");
    mkdirSync(binDir);
    const scanner = path.join(binDir, process.platform === "win32" ? "osv-scanner.cmd" : "osv-scanner");
    writeFileSync(path.join(binDir, "osv-output.json"), JSON.stringify({
      results: [{ packages: [{ package: { name: "lodash", version: "4.17.20", ecosystem: "npm" }, vulnerabilities: [{ id: "OSV-SCANNER", aliases: [], affected: [] }] }] }]
    }));
    if (process.platform === "win32") {
      writeFileSync(scanner, "@echo off\r\ntype \"%~dp0osv-output.json\"\r\n");
    } else {
      writeFileSync(scanner, "#!/usr/bin/env sh\ncat \"$(dirname \"$0\")/osv-output.json\"\n");
      chmodSync(scanner, 0o755);
    }
    const manifest = {
      name: "fixture",
      packageManager: "npm" as const,
      dependencies: { lodash: "4.17.20" },
      devDependencies: {},
      optionalDependencies: {},
      scripts: {},
      manifestPath: path.join(root, "package.json"),
      lockfilePath: path.join(root, "package-lock.json"),
      stack: ["node", "npm"]
    };
    vi.stubEnv("PATH", `${binDir}${path.delimiter}${process.env.PATH ?? ""}`);
    const result = await queryOsvFindings(root, manifest);
    expect(result.scanner).toBe("osv-scanner");
    expect(result.scanConfidence).toBe("lockfile");
    expect(result.findings[0]?.packageName).toBe("lodash");
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });
});

describe("NVD and GHSA enrichment", () => {
  it("merges mocked NVD and GitHub advisory data and records source status", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const value = String(url);
      if (value.includes("nvd")) {
        return new Response(JSON.stringify({ vulnerabilities: [{ cve: { descriptions: [{ lang: "en", value: "NVD description with more detail" }], metrics: { cvssMetricV31: [{ cvssData: { baseScore: 9.8, baseSeverity: "CRITICAL" } }] }, references: { referenceData: [{ url: "https://nvd.example/ref" }] } } }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ ghsa_id: "GHSA-test", summary: "GHSA summary", severity: "high", references: ["https://ghsa.example/ref"] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NVD_API_URL", "https://nvd.example/cves");
    vi.stubEnv("GHSA_API_URL", "https://ghsa.example/advisories");
    const enriched = await enrichVulnerability({ id: "OSV-TEST", source: "osv", cveIds: ["CVE-2021-0001"], ghsaIds: ["GHSA-test"], summary: "short", severity: "low", references: [] });
    expect(enriched.cvssScore).toBe(9.8);
    expect(enriched.severity).toBe("critical");
    expect(enriched.enrichment?.nvd).toBe("found");
    expect(enriched.enrichment?.ghsa).toBe("found");
    expect(enriched.references).toContain("https://nvd.example/ref");
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
});

describe("plugin manifest", () => {
  it("validates manifest and warns on dangerous permissions", () => {
    const root = tempRoot();
    const manifestPath = path.join(root, "plugin.json");
    writeFileSync(manifestPath, JSON.stringify({ id: "patchpilot-test", version: "1.0.0", entry: "./dist/index.js", permissions: ["secrets:read"] }));
    const result = validatePluginManifest(manifestPath);
    expect(result.warnings[0]).toContain("requires explicit review");
    expect(pluginManifestSchema.parse(result.manifest).id).toBe("patchpilot-test");
    rmSync(root, { recursive: true, force: true });
  });
});

describe("Codex prompt and SBOM errors", () => {
  it("contains strict no-secret/no-deploy instructions", () => {
    expect(CODEX_REMEDIATION_PROMPT).toContain("Do not edit secrets");
    expect(CODEX_REMEDIATION_PROMPT).toContain("Stop before merge or deployment");
  });

  it("fails clearly when SBOM tool is missing", () => {
    vi.stubEnv("SYFT_BIN", "definitely-not-installed-syft");
    expect(() => generateSbom(process.cwd())).toThrow(/SBOM generation requires Syft/);
    vi.unstubAllEnvs();
  });
});
