# 03 - MVP Scope and Non-Goals

## MVP goal

Build a working PatchPilot Lite that proves one complete security incident loop.

## MVP must build

### 1. Project inventory

Support:

- GitHub repositories via manual add using owner/repo.
- Local folders via path allowlist.
- Optional Vercel mapping via `.vercel/project.json`.

Inventory fields:

- Project name.
- Source type: `github`, `local`, `vercel-linked`.
- Repo URL or local path.
- Default branch.
- Package manager detected.
- Last scan status.
- Deployment status if known.

### 2. Node.js scanner

Support npm projects first.

Detect:

- `package.json`.
- `package-lock.json`.
- `pnpm-lock.yaml`, phase 1.5.
- `yarn.lock`, phase 1.5.

MVP scanner priority:

1. `osv-scanner --json <path>` if installed.
2. OSV API fallback for `package.json` dependencies.
3. Clear error if no supported scanner path is available.

Important:
- For accurate transitive dependency scanning, lockfiles are preferred.
- If no lockfile exists, report reduced confidence.

### 3. Risk enrichment

Use:

- OSV vulnerability data.
- EPSS API for CVEs.
- CISA KEV catalog for known exploited CVEs.
- NVD optional enrichment for CVSS/detail.

### 4. Watch Commander dashboard

Show:

- Total projects watched.
- Affected projects.
- Critical projects.
- Fixes ready.
- Codex jobs running.
- PRs awaiting approval.
- Recent advisories.

### 5. Vulnerability detail page

Show:

- Vulnerability ID.
- Package.
- Current version.
- Fixed version if known.
- Affected projects.
- EPSS score.
- KEV status.
- Deployment exposure.
- Fix strategy.
- Remediation status.

### 6. Codex remediation worker

Use Codex to:

- Clone/copy project into isolated workspace.
- Read advisory and dependency data.
- Apply minimal safe fix.
- Run install/test/build.
- Produce summary.
- Create diff.

### 7. Validation

Run configured commands:

- Install: `npm install` or `npm ci`.
- Test: `npm test` if script exists.
- Build: `npm run build` if script exists.

If script missing:
- Mark as `skipped_no_script`, not pass/fail.

### 8. GitHub PR creation

If source is GitHub:

- Create branch `patchpilot/<safe-slug>/<short-id>`.
- Commit only relevant files.
- Create draft PR by default.
- PR body must include vulnerability, risk score, validation logs, and audit receipt ID.

If source is local only:

- Create local branch if git repo.
- Produce patch file.
- Show manual PR instructions.

### 9. Telegram approval

Send approval card:

- Project.
- Vulnerability.
- Risk.
- Fix summary.
- Validation result.
- PR link.
- Buttons: Approve, Reject, Review, Retry safer fix.

MVP approval action:
- Approve = mark approved in PatchPilot and optionally remove draft status if configured.
- Do not merge automatically unless explicit opt-in exists and is off by default.

### 10. Audit receipt

Create receipt for:

- Scan completed.
- Fix job started.
- Files changed.
- Validation completed.
- PR created.
- Approval decision.

## MVP should include as bonus if time permits

- Agent Supply-Chain Shield mini scan:
  - Detect `.codex/config.toml`.
  - Detect MCP config files.
  - Warn on `dangerously-bypass-approvals-and-sandbox`, `danger-full-access`, unknown MCP commands, `.env` committed, and broad GitHub token patterns.
- Package Quarantine Shield:
  - Warn on install scripts in newly introduced packages.
  - Warn on package versions published very recently if npm metadata integration is implemented.
- OpenClaw bridge:
  - Expose a minimal MCP server or document plugin.

## Non-goals for hackathon MVP

Do not build:

- Full enterprise SSO.
- Multi-tenant billing.
- WhatsApp Business integration.
- Full Python/Java/Rust ecosystem support.
- Production auto-deployment.
- Full SBOM management platform.
- Full SAST engine.
- Kubernetes scanning.
- Container image scanning.
- Complete plugin marketplace.
- Full OpenClaw plugin if Telegram already works.

## Phase 2

After MVP:

- Add pnpm/yarn robust scanning.
- Add Python requirements/Poetry support.
- Add Trivy adapter.
- Add Syft/Grype SBOM before/after diff.
- Add GitHub App install flow.
- Add OpenClaw plugin.
- Add PatchPilot MCP server.
- Add Slack/Discord approvals.
- Add Vercel preview deployment verification.
- Add rollback automation.
- Add plugin SDK and signed plugin registry.
