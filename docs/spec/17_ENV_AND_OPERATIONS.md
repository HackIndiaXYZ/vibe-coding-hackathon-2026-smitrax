# 17 - Environment and Operations

## Local services

Required:

- Node.js 20 or later.
- pnpm.
- PostgreSQL.
- Redis.
- Git.
- Codex CLI.
- OSV-Scanner CLI recommended.
- Docker recommended for isolated workers.

## Environment variables

Create `.env.example` with:

```text
# App
APP_PUBLIC_URL=http://localhost:3000
NODE_ENV=development

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/patchpilot

# Redis
REDIS_URL=redis://localhost:6379

# GitHub
GITHUB_TOKEN=
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_APP_INSTALLATION_ID=

# OpenAI / Codex
OPENAI_API_KEY=
CODEX_BIN=codex
CODEX_ENABLED=true
CODEX_SANDBOX_MODE=workspace-write

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_CHAT_IDS=
TELEGRAM_WEBHOOK_SECRET=
APPROVAL_HMAC_SECRET=

# Local folder scanning
PATCHPILOT_LOCAL_ROOTS=

# Vercel optional
VERCEL_TOKEN=
VERCEL_TEAM_ID=

# Safety
PATCHPILOT_ALLOW_AUTO_MERGE=false
PATCHPILOT_ALLOW_PROD_DEPLOY=false
PATCHPILOT_WORKER_MODE=local
PATCHPILOT_RETAIN_WORKSPACES=false
```

No real secrets should be committed.

## Local setup commands

```bash
pnpm install
pnpm db:migrate
pnpm dev
pnpm worker:dev
```

Run Redis locally:

```bash
docker run --name patchpilot-redis -p 6379:6379 redis:7
```

Run Postgres locally:

```bash
docker run --name patchpilot-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=patchpilot -p 5432:5432 postgres:16
```

## Codex setup

Check:

```bash
codex --version
codex exec --help
```

If Codex is not installed/authenticated:

- UI should show Codex disabled.
- Remediation button should explain setup needed.

## OSV-Scanner setup

Check:

```bash
osv-scanner --version
```

If unavailable:

- Use OSV API fallback for direct dependencies.
- Show reduced confidence.

## Worker workspace

Default:

```text
.patchpilot/workspaces/<job-id>
```

For production:

- Use Docker volume.
- Destroy after job unless retention enabled.
- Store logs separately.

## Logs

Use structured JSON logs.

Log levels:

- debug
- info
- warn
- error

Never log secrets.

## Scheduled jobs

MVP:

- Manual scan.
- Optional cron-like daily scan using worker scheduler.

Phase 2:

- Every 6 hours feed update.
- Daily project scan.
- Immediate scan on GitHub webhook.

## Backups

MVP local:

- Database only.
- Workspaces are disposable.

Production:

- Database backup.
- Object storage for logs if needed.
- No secret values in logs.

## Deployment

Hackathon recommended:

- Web/API: Vercel or local demo.
- Worker: local machine or small VPS.
- Redis/Postgres: Supabase/Upstash/local Docker.

Important:
- Vercel serverless is not ideal for long-running Codex jobs.
- Run worker separately.

## Operational states

Dashboard should show integration health:

```text
Database: OK
Redis: OK
GitHub: Configured
OSV: OK
EPSS: OK
KEV: OK
Codex: Available
Telegram: Configured
Worker: Online
```
