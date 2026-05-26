# 04 - User Stories and Acceptance Criteria

## Persona

Primary persona: developer managing many projects across GitHub, local folders, and deployments.

Secondary persona: small team lead who wants CVE response visibility without a full enterprise AppSec tool.

## Story 1 - Add GitHub repository

As a developer, I want to add a GitHub repository so PatchPilot can scan it for vulnerabilities.

Acceptance criteria:

- User can enter `owner/repo`.
- PatchPilot validates GitHub access.
- PatchPilot stores repository metadata.
- PatchPilot can clone or fetch repository contents for scan/remediation.
- If token is missing or unauthorized, UI shows a clear error.
- No fake repo is added when GitHub validation fails.

## Story 2 - Add local folder

As a developer, I want to add a local folder so PatchPilot can watch private or side projects not on GitHub.

Acceptance criteria:

- User can add a local path from an allowlisted root.
- Path traversal and unsafe symlink traversal are blocked.
- PatchPilot detects project type.
- PatchPilot stores local project metadata.
- Scan works without GitHub.

## Story 3 - Scan all projects

As a developer, I want to scan all watched projects and see which are affected.

Acceptance criteria:

- User clicks "Scan all".
- Every project gets a scan job.
- Scan status is visible: queued, running, completed, failed.
- Findings are stored per project.
- Failed external services show clear failure reason.
- Safe projects are only marked safe after real scan completed.

## Story 4 - See Threat Radar

As a developer, I want to see relevant new vulnerability and supply-chain events.

Acceptance criteria:

- Dashboard shows count of advisories checked.
- Dashboard shows count relevant to watched stack.
- KEV and high EPSS findings are highlighted.
- If feed update fails, dashboard shows stale/failure status.

## Story 5 - See blast radius

As a developer, I want to know all projects affected by a vulnerability.

Acceptance criteria:

- Vulnerability page lists affected projects.
- Each project shows source, deployment status, dependency path if known, and fix state.
- Direct dependencies are visually separated from transitive dependencies.
- Production/exposed projects are prioritized.

## Story 6 - Start Codex fix

As a developer, I want PatchPilot to assign Codex to safely patch a project.

Acceptance criteria:

- User can start remediation from a finding.
- PatchPilot creates a remediation job.
- Codex receives advisory, current package version, target safe version, validation commands, and strict rules.
- Worker stores every important job event.
- Worker never runs without isolation.
- Worker never accesses production secrets.
- If Codex is unavailable, job fails clearly.

## Story 7 - Validate fix

As a developer, I want PatchPilot to test/build the patched project before asking approval.

Acceptance criteria:

- Install command runs.
- Test command runs if defined.
- Build command runs if defined.
- Logs are captured.
- Exit codes are stored.
- Missing scripts are marked skipped, not passed.
- PR is not created when required validation fails, unless user explicitly chooses manual-review PR.

## Story 8 - Create PR

As a developer, I want PatchPilot to create a pull request after validation passes.

Acceptance criteria:

- PatchPilot creates a new branch.
- Commit includes only relevant files.
- PR is draft by default.
- PR body includes:
  - Vulnerability summary.
  - Risk score.
  - Files changed.
  - Validation results.
  - Audit receipt ID.
  - Rollback note.
- PR URL is stored.
- If GitHub API fails, UI shows failure and no fake URL.

## Story 9 - Approve from phone

As a developer, I want to approve or reject safe fixes from Telegram.

Acceptance criteria:

- Telegram message includes project, vulnerability, risk, validation, PR link.
- Buttons work through signed callback data.
- Approve marks the PR/job approved.
- Reject marks rejected and records reason if supplied.
- Unauthorized chat IDs cannot approve.
- Every decision generates audit receipt.

## Story 10 - Audit receipt

As a developer, I want every security action to be auditable.

Acceptance criteria:

- Every state-changing action creates a receipt.
- Receipt includes actor, channel, action, target, timestamp, before/after state where relevant.
- Secret values are redacted.
- Receipts can be opened from dashboard and PR.
- Receipt IDs are stable.

## Story 11 - Agent Supply-Chain Shield

As a developer, I want PatchPilot to warn me if my AI agent/tooling setup is dangerous.

Acceptance criteria:

- PatchPilot scans repo/workspace config files.
- Warns on risky Codex sandbox/approval settings.
- Warns on unknown MCP server commands.
- Warns on committed `.env`.
- Warns on broad tokens if detectable.
- Warnings do not block scanning, but can block remediation depending on severity.
