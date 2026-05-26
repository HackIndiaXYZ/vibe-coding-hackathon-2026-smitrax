# 05 - System Architecture

## Architecture overview

PatchPilot uses a web dashboard, API layer, worker queue, scanners, Codex remediation workers, integration adapters, and an audit log.

```text
Security Feeds
OSV / NVD / EPSS / CISA KEV / OpenSSF malicious-packages
        |
        v
Feed Ingest + Risk Enrichment
        |
        v
Project Inventory -----> Scanner Jobs -----> Findings
 GitHub repos              OSV scanner         Risk score
 Local folders             OSV API            Blast radius
 Vercel mapping
        |
        v
Watch Commander Dashboard
        |
        v
Remediation Queue
        |
        v
Isolated Worker
Clone/copy project -> Codex fix -> install/test/build -> diff
        |
        v
GitHub PR / Local Patch
        |
        v
Telegram/OpenClaw Approval
        |
        v
Audit Receipt Store
```

## Services

### Web app

Responsibilities:

- Render dashboard.
- Manage projects.
- Show findings.
- Start scan/remediation jobs.
- Show job timelines.
- Show approval status.
- Show audit receipts.

Recommended implementation:

- Next.js App Router.
- Server components for data pages.
- Client components for live job updates.
- Tailwind for UI.
- Optional polling first; WebSocket/SSE later.

### API layer

Responsibilities:

- Project CRUD.
- Scan orchestration.
- Remediation orchestration.
- Webhook callbacks.
- Telegram callback verification.
- Audit receipt read APIs.

Recommended implementation:

- Next.js route handlers or Express inside `apps/api`.
- Use Prisma for persistence.
- Use Zod for request validation.

### Worker

Responsibilities:

- Execute scan jobs.
- Execute feed ingestion.
- Execute Codex remediation jobs.
- Run validation commands.
- Create PRs.
- Send Telegram messages.

Recommended implementation:

- Node.js TypeScript worker.
- BullMQ queue.
- Redis.
- Docker isolation for remediation jobs.

### Scanner adapters

MVP adapters:

- OSV-Scanner CLI adapter.
- OSV API adapter.
- Agent config scanner.

Phase 2 adapters:

- Trivy adapter.
- Syft adapter.
- Grype adapter.
- GitHub Dependabot alerts adapter.
- GitHub MCP security scan adapter.

### Integration adapters

MVP adapters:

- GitHub adapter using Octokit.
- Local filesystem adapter.
- Telegram adapter.

Phase 2 adapters:

- Vercel adapter.
- OpenClaw plugin.
- MCP server.
- Slack/Discord.

## Data flow: scanning

1. User adds project.
2. User starts scan or scheduled scan runs.
3. API creates `ScanJob`.
4. Worker pulls job.
5. Worker resolves source:
   - GitHub: clone/fetch.
   - Local: use path after safety validation.
6. Worker detects package ecosystem.
7. Worker runs OSV-Scanner or OSV API.
8. Worker normalizes findings.
9. Worker enriches with EPSS and KEV.
10. Worker stores `Finding` and `RiskSignal`.
11. UI updates dashboard.

## Data flow: remediation

1. User starts fix for a finding.
2. API creates `RemediationJob`.
3. Worker creates isolated workspace.
4. Worker obtains source:
   - GitHub clone on new branch.
   - Local git branch or temp copy.
5. Worker writes a job context file for Codex.
6. Worker runs Codex using `codex exec`.
7. Worker captures events and file changes.
8. Worker runs validation commands.
9. Worker computes fix confidence.
10. Worker creates GitHub PR or local patch.
11. Worker sends Telegram approval.
12. Audit receipt is generated.

## Isolation model

Minimum MVP dev mode:

- Temp directory per job.
- Only selected repo/folder copied.
- Only allowlisted environment variables.
- Secrets redacted.
- Cleanup after job.

Production-like mode:

- Docker container per job.
- Read/write mounted workspace only.
- No host Docker socket.
- No production env.
- Network restricted where possible.
- Token only for selected repo.

## State machines

### Scan job states

- `queued`
- `running`
- `completed`
- `failed_external_service`
- `failed_invalid_project`
- `failed_internal_error`

### Finding states

- `open`
- `fix_available`
- `fix_running`
- `pr_ready`
- `awaiting_approval`
- `approved`
- `rejected`
- `ignored`
- `resolved`

### Remediation job states

- `queued`
- `cloning`
- `codex_running`
- `validating`
- `validation_failed`
- `pr_creating`
- `pr_ready`
- `approval_sent`
- `approved`
- `rejected`
- `failed`

### Approval states

- `pending`
- `approved`
- `rejected`
- `expired`
- `unauthorized`

## Event logging

Every job should append structured events:

```json
{
  "time": "2026-05-26T12:00:00.000Z",
  "jobId": "rem_123",
  "type": "validation.command.completed",
  "level": "info",
  "message": "npm test completed",
  "data": {
    "command": "npm test",
    "exitCode": 0,
    "durationMs": 12345
  }
}
```

Do not store raw secrets in `data`.
