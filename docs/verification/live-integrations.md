# Live Integration Verification

Run these only against disposable repositories, branches, chats, and fixtures. Do not use production repositories or production secrets.

## GitHub Repo Scan

- Required env vars: `GITHUB_TOKEN`, `PATCHPILOT_LIVE_GITHUB_OWNER`, `PATCHPILOT_LIVE_GITHUB_REPO`.
- Optional env vars: `PATCHPILOT_LIVE_GITHUB_BRANCH` defaults to `main`.
- Command:

```powershell
$env:GITHUB_TOKEN="..."
$env:PATCHPILOT_LIVE_GITHUB_OWNER="owner"
$env:PATCHPILOT_LIVE_GITHUB_REPO="repo"
@'
import { JsonDatabase, PatchPilotService } from "./packages/core/src/index.ts";
const service = new PatchPilotService(new JsonDatabase());
const project = await service.createProject({
  sourceType: "github",
  githubOwner: process.env.PATCHPILOT_LIVE_GITHUB_OWNER,
  githubRepo: process.env.PATCHPILOT_LIVE_GITHUB_REPO
});
const scan = await service.scanProject(project.id);
console.log(JSON.stringify({ project, scan }, null, 2));
'@ | pnpm exec tsx -
```

- Expected output: project is created, scan status is `completed`, scanner is `osv-api` or `osv-scanner`.
- Failure mode: `github_token_missing`, `github_repo_not_accessible`, `osv_api_failed`, or unsupported project when no `package.json` exists.
- Safety warning: cloning uses a disposable workspace and scrubs tokenized remotes, but use a test repo.
- Cleanup: delete the created project from the JSON data file if it is only a test record.

## GitHub PR Creation

- Required env vars: `GITHUB_TOKEN`, `PATCHPILOT_LIVE_GITHUB_OWNER`, `PATCHPILOT_LIVE_GITHUB_REPO`.
- Precondition: the test repository has a fixable npm finding and branch push permissions.
- Command:

```powershell
@'
import { JsonDatabase, PatchPilotService } from "./packages/core/src/index.ts";
const db = new JsonDatabase();
const service = new PatchPilotService(db);
const finding = db.read().findings.find((item) => item.status === "fix_available" && item.fixedVersion);
if (!finding) throw new Error("No fixable finding. Run the GitHub scan first.");
const job = await service.startRemediation(finding.id, "deterministic-npm");
console.log(JSON.stringify(job, null, 2));
'@ | pnpm exec tsx -
```

- Expected output: remediation validates and creates a draft PR record with a real URL. Validation artifacts such as `node_modules/`, build outputs, logs, and temporary workspace files are excluded from the commit.
- Failure mode: validation failure, `unsafe_commit_files`, `github_pr_create_failed`, push permission failure, or missing token.
- Safety warning: only run against a disposable branch/test repo. PatchPilot does not auto-merge.
- Cleanup: close the draft PR and delete the `patchpilot/...` branch.

## Telegram Send

- Required env vars: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `APPROVAL_SIGNING_SECRET`.
- Recommended env var: `TELEGRAM_WEBHOOK_SECRET`.
- Command:

```powershell
@'
import { sendTelegramApproval } from "./packages/core/src/index.ts";
const chatId = (process.env.TELEGRAM_CHAT_ID ?? "").split(",")[0];
if (!chatId) throw new Error("No TELEGRAM_CHAT_ID configured.");
const result = await sendTelegramApproval({
  chatId,
  text: "PatchPilot live verification message. No approval action is being performed."
});
console.log(JSON.stringify(result, null, 2));
'@ | pnpm exec tsx -
```

- Expected output: real Telegram `messageId`.
- Failure mode: `telegram_not_configured`, `telegram_send_failed`, bot not allowed in chat.
- Safety warning: send only to a test chat.
- Cleanup: delete the test message manually if desired.

## Live Codex Remediation

- Required env vars: authenticated Codex CLI on PATH or `CODEX_BIN`, `CODEX_ENABLED=true`.
- Optional env vars: `CODEX_TIMEOUT_MS`, `PATCHPILOT_RETAIN_WORKSPACES=true` for debugging.
- Command:

```powershell
pnpm verify:local-e2e
# Then run a Codex remediation only on a disposable fixture finding:
@'
import { JsonDatabase, PatchPilotService } from "./packages/core/src/index.ts";
const db = new JsonDatabase();
const service = new PatchPilotService(db);
const finding = db.read().findings.find((item) => item.status === "fix_available" && item.fixedVersion);
if (!finding) throw new Error("No safe fixture finding available.");
const job = await service.startRemediation(finding.id, "codex");
console.log(JSON.stringify(job, null, 2));
'@ | pnpm exec tsx -
```

- Expected output: Codex runs with `--sandbox workspace-write`, validation passes, and a local patch artifact or draft PR is produced.
- Failure mode: `codex_unavailable`, `codex_safety_unavailable`, timeout status `124`, validation failure.
- Safety warning: run only on a disposable fixture or disposable GitHub branch. Do not point Codex at a production repo.
- Cleanup: remove retained workspace if `PATCHPILOT_RETAIN_WORKSPACES=true`.

## Optional OSV-Scanner Path

- Required tool: `osv-scanner` available on PATH.
- Command:

```powershell
osv-scanner --version
pnpm verify:local-e2e
```

- Expected output: scan records use scanner `osv-scanner` and findings use `scanConfidence: lockfile`.
- Failure mode: scanner unavailable or JSON parse failure.
- Safety warning: read-only scan, but run against a test fixture first.
- Cleanup: none.

## Optional NVD Key Path

- Optional env var: `NVD_API_KEY`.
- Command:

```powershell
$env:NVD_API_KEY="..."
pnpm scan:fixture
```

- Expected output: CVE enrichment succeeds when NVD has data; source status is recorded.
- Failure mode: NVD rate limiting, `error` enrichment status.
- Safety warning: do not commit the key.
- Cleanup: clear `$env:NVD_API_KEY`.

## Optional Vercel Later

- Required env var: `VERCEL_TOKEN`.
- Command: not part of this verification sprint.
- Expected output: future deployment lookup should report real project/deployment metadata.
- Failure mode: missing token or unauthorized project.
- Safety warning: do not deploy from verification.
- Cleanup: clear `VERCEL_TOKEN`.
