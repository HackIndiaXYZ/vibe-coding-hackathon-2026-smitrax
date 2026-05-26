# 07 - Security Model

## Security principles

1. Agents assist. Humans approve.
2. Every write action is audited.
3. Minimal permissions always.
4. No production secrets in remediation jobs.
5. Scanning cannot mean execution unless isolated.
6. Plugins/MCP tools are treated as untrusted until reviewed.
7. Failing closed is better than silently marking safe.

## Main risks

### Risk 1 - Malicious package execution

Package managers can execute lifecycle scripts such as `preinstall`, `install`, and `postinstall`.

Controls:

- Two-pass scan:
  - Pass 1: metadata/lockfile scan without package execution.
  - Pass 2: isolated validation in disposable workspace.
- Prefer `npm ci --ignore-scripts` for scan prep when possible.
- Only run normal install in validation container.
- Log all scripts that run.
- Warn on newly introduced packages with install scripts.

### Risk 2 - Agent overreach

Codex could modify unrelated files or run risky commands.

Controls:

- Strict prompt: minimal safe fix only.
- Workspace-scoped sandbox.
- Diff review.
- Reject unrelated file changes unless justified.
- Command allowlist/warnings.
- No production secrets.
- No host filesystem access outside workspace.
- Never auto-merge by default.

### Risk 3 - Token leakage

Workers may need GitHub tokens and Telegram tokens.

Controls:

- Keep tokens server-side only.
- Redact tokens in logs.
- Use short-lived GitHub App installation tokens when possible.
- Personal token only for MVP local development.
- Scope token to repo contents/pull requests.
- Never pass tokens into Codex prompt.
- Never write tokens to workspace.

### Risk 4 - Local path traversal

Local scanner might read arbitrary system files.

Controls:

- User-configured allowlist roots.
- Resolve realpath.
- Reject paths outside allowlist.
- Reject symlink traversal outside project root.
- Ignore `.env`, secrets, private keys unless specifically scanning for presence, not contents.
- Never upload local file contents to external services except package metadata needed for scanning.

### Risk 5 - Telegram approval spoofing

Attackers could trigger approval callbacks.

Controls:

- Callback data must include signed HMAC.
- Approval request must expire.
- Only configured chat IDs can approve.
- Store hash of chat ID.
- Record actor/channel in audit receipt.
- Approve action should not merge by default.

### Risk 6 - MCP/plugin compromise

MCP servers and OpenClaw plugins can expose tools or run code.

Controls:

- Maintain tool allowlist.
- Show unknown MCP servers in Agent Supply-Chain Shield.
- Scan config files:
  - `mcp.json`
  - `.cursor/mcp.json`
  - `.vscode/mcp.json`
  - `.codex/config.toml`
  - OpenClaw plugin manifests
- Warn if MCP command uses shell wrappers, curl-pipe-shell, unknown packages, broad filesystem access.
- Phase 2: integrate a dedicated MCP scanner.

### Risk 7 - Fake safety

A scanner can fail and the UI may mistakenly mark safe.

Controls:

- Distinguish `safe` from `scan_failed`.
- If OSV/NVD/EPSS/KEV failed, show stale/incomplete risk signals.
- Risk score must indicate confidence level.
- Never claim zero vulnerabilities without a successful scan.

## Two-pass security flow

### Pass 1 - Metadata scan

Runs with:

- No package install.
- No lifecycle scripts.
- No production secrets.
- Read package manifests and lockfiles.
- Query OSV/KEV/EPSS.

Output:

- Findings.
- Risk score.
- Fix strategy.
- Remediation recommendation.

### Pass 2 - Isolated validation

Runs with:

- Disposable workspace/container.
- Repo-scoped token only if PR needed.
- No production env.
- Command logs.
- Optional network allowlist.
- Cleanup after job.

Output:

- Diff.
- Validation results.
- PR.
- Audit receipt.

## Agent Supply-Chain Shield checks

MVP checks:

- `.env` committed.
- Files matching private key patterns:
  - `id_rsa`
  - `*.pem`
  - `*.key`
- GitHub Actions using:
  - `pull_request_target` with checkout of untrusted code.
  - unpinned third-party actions.
  - broad `permissions: write-all`.
- Codex config:
  - `dangerously-bypass-approvals-and-sandbox`
  - `danger-full-access`
  - workspace trust warnings.
- MCP config:
  - unknown commands.
  - shell command wrappers.
  - package execution without pinned version.
- npm:
  - `preinstall`, `install`, `postinstall` scripts.
  - new packages introduced by the fix.

## Approval modes

MVP default:

- Mode 1: Suggest and create draft PR only.
- Mode 2: Create PR + send approval.
- Mode 3: Merge after phone approval. Disabled by default.
- Mode 4: Production deploy after second approval. Phase 2 only.

## Audit receipt minimum fields

Each receipt must include:

- Receipt ID.
- Timestamp.
- Actor.
- Channel.
- Action.
- Target project/finding/job.
- Before state.
- After state.
- Validation summary.
- PR URL if available.
- Redaction flag.

## Secret redaction patterns

Redact:

- GitHub tokens.
- OpenAI keys.
- Telegram bot token.
- Supabase URLs with service role keys.
- Vercel tokens.
- AWS keys.
- Any value matching high entropy token patterns.

## Secure defaults

- Draft PRs only.
- No production deploy.
- No auto-merge.
- No running untrusted lifecycle scripts outside isolation.
- No local path outside allowlist.
- No storing raw Telegram chat ID if not needed.
- No printing environment variables.
