# 13 - Repo Structure and Implementation Plan

## Recommended monorepo layout

```text
patchpilot/
  apps/
    web/
      app/
      components/
      lib/
      public/
    worker/
      src/
  packages/
    core/
      src/
        types/
        errors/
        logger/
        redaction/
    db/
      prisma/
      src/
    scanners/
      src/
        osvScannerCli.ts
        osvApi.ts
        agentConfigScanner.ts
    risk-engine/
      src/
        score.ts
        epss.ts
        kev.ts
        nvd.ts
    integrations/
      src/
        github/
        telegram/
        vercel/
        local/
    codex-runner/
      src/
        codexExec.ts
        prompts.ts
        validation.ts
    audit/
      src/
    ui/
      src/
  tests/
    fixtures/
      vulnerable-npm-project/
    integration/
    e2e/
  docs/
    research/
    architecture/
  package.json
  pnpm-workspace.yaml
  turbo.json
  .env.example
```

## Implementation phases

### Phase 0 - Project bootstrap

Tasks:

- Create pnpm workspace.
- Add TypeScript.
- Add ESLint/Prettier.
- Add Next.js app.
- Add worker app.
- Add Prisma/Postgres.
- Add BullMQ/Redis.
- Add `.env.example`.

Acceptance:

- `pnpm install` works.
- `pnpm lint` works.
- `pnpm test` works.
- `pnpm dev` starts web app.
- `pnpm worker:dev` starts worker.

### Phase 1 - Database and core types

Tasks:

- Implement Prisma schema.
- Add migrations.
- Add core TypeScript types.
- Add error format.
- Add redaction helper.

Acceptance:

- `pnpm db:migrate` works.
- Unit tests for redaction pass.

### Phase 2 - Project inventory

Tasks:

- Add project CRUD APIs.
- Add GitHub repo validation.
- Add local path validation.
- Add project list UI.

Acceptance:

- Add GitHub repo with valid token.
- Add local folder inside allowlist.
- Reject local folder outside allowlist.

### Phase 3 - Scanning

Tasks:

- Add scan queue.
- Implement OSV-Scanner CLI adapter.
- Implement OSV API fallback.
- Normalize findings.
- Store findings.

Acceptance:

- Demo vulnerable npm project produces lodash finding.
- Scan failure is not marked safe.
- Findings show in dashboard.

### Phase 4 - Risk enrichment

Tasks:

- Add EPSS client.
- Add CISA KEV client.
- Add risk score.
- Add risk explanation.

Acceptance:

- Risk score includes visible factors.
- KEV hit increases risk.
- EPSS unavailable marks signal stale, not fake.

### Phase 5 - Dashboard and finding pages

Tasks:

- Watch Commander dashboard.
- Threat Radar card.
- Project table.
- Finding detail page.
- Job timeline component.

Acceptance:

- User can see affected projects and start remediation.

### Phase 6 - Codex remediation

Tasks:

- Create remediation queue.
- Create isolated workspace.
- Run Codex.
- Capture events/logs.
- Compute diff.
- Run validation.
- Compute fix confidence.

Acceptance:

- Codex job modifies vulnerable demo project.
- Validation logs stored.
- Failed validation blocks PR.

### Phase 7 - GitHub PR

Tasks:

- Create branch.
- Commit changes.
- Push branch.
- Create draft PR.
- Store PR.
- Add PR body.

Acceptance:

- Real PR is created when token permits.
- No fake PR when API fails.

### Phase 8 - Telegram approval

Tasks:

- Telegram bot adapter.
- Send approval message.
- Webhook/callback route.
- HMAC callback verification.
- Approval status update.
- Audit receipt.

Acceptance:

- Telegram message arrives.
- Approve/Reject buttons update status.
- Unauthorized chat rejected.

### Phase 9 - Agent Supply-Chain Shield

Tasks:

- Scan config files.
- Warn risky Codex config.
- Warn suspicious MCP config.
- Warn `.env` committed.
- Show dashboard card.

Acceptance:

- Fixture risky config produces warnings.

### Phase 10 - Polish and demo

Tasks:

- Seed demo data only through real fixture scans.
- Add final UI polish.
- Add README.
- Add demo script.
- Add tests.

Acceptance:

- 5-minute demo works smoothly.

## Scripts

Recommended root scripts:

```json
{
  "scripts": {
    "dev": "pnpm --filter @patchpilot/web dev",
    "worker:dev": "pnpm --filter @patchpilot/worker dev",
    "build": "pnpm -r build",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "db:migrate": "pnpm --filter @patchpilot/db prisma migrate dev",
    "db:studio": "pnpm --filter @patchpilot/db prisma studio"
  }
}
```

## Dependency choices

Suggested:

- `next`
- `react`
- `typescript`
- `tailwindcss`
- `zod`
- `@prisma/client`
- `prisma`
- `bullmq`
- `ioredis`
- `octokit`
- `telegraf`
- `execa`
- `simple-git`
- `nanoid`
- `pino`
- `vitest`
- `playwright`

## Engineering rules

- Every external integration must have an interface.
- Every integration must have real implementation and test mock.
- Every job must be resumable or safely fail.
- Every action must log a structured event.
- Every error must use the standard API error format.
- Never ignore failed promises.
