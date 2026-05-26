# 11 - Telegram, OpenClaw, and MCP Integration

## MVP approval channel: Telegram

Telegram is the best MVP choice because it is fast to implement and works well for approval buttons.

## Telegram setup

Use:

- Telegram Bot API directly, or
- Telegraf library.

Environment variables:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_ALLOWED_CHAT_IDS
TELEGRAM_WEBHOOK_SECRET
APP_PUBLIC_URL
APPROVAL_HMAC_SECRET
```

## Approval message

Example:

```text
PatchPilot approval needed

Project: chat-app
Risk: 78/100 High
Package: lodash
Fix: 4.17.20 -> 4.17.21
Validation:
- install: passed
- test: passed
- build: passed

PR: https://github.com/example/chat-app/pull/12

Choose:
Approve PR | Reject | Review | Retry safer fix
```

## Callback security

Callback data should be compact and signed.

Example payload before signing:

```json
{
  "approvalId": "appr_123",
  "action": "approve",
  "exp": 1770000000
}
```

Signature:

```text
base64url(payload).base64url(hmac_sha256(payload, APPROVAL_HMAC_SECRET))
```

On callback:

1. Verify signature.
2. Verify expiry.
3. Verify chat ID allowlist.
4. Verify approval status is pending.
5. Apply action.
6. Create audit receipt.

## Approval actions

### Approve

MVP:

- Mark remediation approved.
- Mark PR approved in PatchPilot.
- Optionally convert draft PR to ready for review if GitHub implementation supports it and user enabled it.

Not default:

- Merge PR.

### Reject

- Mark rejected.
- Store reason if UI supports.
- Create audit receipt.

### Review

- Reply with PR link and dashboard link.

### Retry safer fix

- Create new remediation job with stricter prompt:
  - patch/minor only.
  - no major upgrade.
  - no source changes unless required.

## OpenClaw integration

OpenClaw is a phase-2 or bonus integration.

PatchPilot can integrate in two ways:

### Option A - OpenClaw plugin

PatchPilot provides an OpenClaw plugin that exposes commands:

```text
/patchpilot status
/patchpilot scan
/patchpilot affected
/patchpilot approve <id>
/patchpilot reject <id>
```

### Option B - PatchPilot MCP server

PatchPilot exposes MCP tools:

```text
patchpilot.list_projects
patchpilot.scan_project
patchpilot.list_findings
patchpilot.get_blast_radius
patchpilot.start_codex_fix
patchpilot.get_job_status
patchpilot.create_approval
patchpilot.record_decision
```

OpenClaw can use MCP mode to bridge channel conversations to PatchPilot.

## MCP server design

MVP can document MCP. Phase 2 can implement.

### Tool: patchpilot.list_projects

Input:

```json
{
  "status": "affected"
}
```

Output:

```json
{
  "projects": [
    {
      "id": "proj_123",
      "name": "chat-app",
      "riskLevel": "high",
      "openFindings": 2
    }
  ]
}
```

### Tool: patchpilot.start_codex_fix

Input:

```json
{
  "findingId": "find_123",
  "mode": "draft_pr"
}
```

Output:

```json
{
  "jobId": "rem_123",
  "status": "queued"
}
```

## OpenClaw conversation demo

```text
User:
PatchPilot, any CVEs today?

OpenClaw/PatchPilot:
7 projects affected.
5 fixes passed validation.
2 need review.
Highest risk: api-server deployed to production.
Approve safe PRs?

[Approve 5] [Review critical] [Retry safer] [Ignore low]
```

## Security for OpenClaw/MCP

- Treat OpenClaw plugins as trusted executable code.
- Treat MCP tools as sensitive because they can expose repo/project operations.
- Require explicit enablement.
- Use tool allowlist.
- Use signed approval decisions.
- Do not expose tokens through MCP tool outputs.
- Audit every MCP-triggered action.
