# PatchPilot Watch Commander

PatchPilot is an open-source CVE and supply-chain response command center. It inventories GitHub repos and allowlisted local folders, scans Node.js dependencies with real OSV data, enriches risk with EPSS/CISA KEV when available, shows blast radius, records audit receipts, and gates remediation/approval through real tools or explicit configuration errors.

This repository does not fake external integrations. Missing GitHub, Telegram, Codex, OpenClaw, Vercel, Redis, or SBOM tooling is shown as `not_configured` or `unavailable`.

## Quick Start

```bash
pnpm install
copy .env.example .env
pnpm test
pnpm dev
```

Open `http://127.0.0.1:3000`.

To scan a local folder, set `PATCHPILOT_LOCAL_ROOTS` in `.env` to the parent folder that contains the project. Local scanning rejects paths outside this allowlist.

```bash
$env:PATCHPILOT_LOCAL_ROOTS="<absolute path to>\patchpilot\tests\fixtures"
pnpm scan:fixture
```

## Main Commands

```bash
pnpm dev          # Next.js dashboard and API
pnpm worker:dev   # local worker status, --scan-all supported
pnpm mcp:dev      # stdio MCP server
pnpm typecheck
pnpm test
pnpm build
pnpm verify:local-e2e
pnpm smoke:app http://127.0.0.1:3000
```

## Required Env Vars By Integration

- Local folder scanning: `PATCHPILOT_LOCAL_ROOTS`
- GitHub repo validation and PRs: `GITHUB_TOKEN`
- Telegram approval: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_IDS`, `APPROVAL_HMAC_SECRET`
- Codex remediation execution: `CODEX_BIN`, `CODEX_ENABLED=true`, authenticated Codex CLI
- OpenAI SDK plan adapter: `OPENAI_API_KEY`, optional `OPENAI_MODEL`
- Vercel AI SDK plan adapter: `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`, optional `AI_GATEWAY_MODEL`
- Vercel deployment API: `VERCEL_TOKEN`
- SBOM generation: `SYFT_BIN` pointing to installed Syft
- Optional local state path: `PATCHPILOT_DATA_FILE`

## What Works Locally

- File-backed persistent state at `.patchpilot/patchpilot.db.json`.
- Dashboard metrics from stored state only.
- Local project inventory with path traversal/allowlist checks.
- Real OSV API dependency scanning for direct npm dependencies, with OSV-Scanner lockfile/transitive scanning when the CLI is installed.
- EPSS and CISA KEV enrichment when CVEs are present.
- NVD and GitHub Advisory enrichment as best-effort lookups; source errors are stored separately from not-found.
- Risk scoring with missing-data indicators.
- Agent Supply-Chain Shield checks for risky Codex/MCP/GitHub Actions/package/env patterns.
- Audit receipt creation with hash chaining.
- Telegram approval HMAC verification route.
- MCP server tools that call application services and refuse fake success.
- Deterministic npm remediation that validates, writes a local patch artifact, and does not mark rollback available until the patch is applied.
- Codex CLI remediation in disposable secret-scrubbed workspaces when authenticated.
- BYO model provider layer (`PATCHPILOT_AGENT_PROVIDER`): Codex workspace editor, OpenRouter / OpenAI-compatible / Ollama strict-JSON plan advisors, and the deterministic fixer. Only Codex and PatchPilot's own applier mutate files; advisors only return plans. See `docs/model-providers.md`.
- OpenAI SDK and Vercel AI SDK remediation-plan adapters.

## Configuration-Gated Features

- GitHub PR creation requires a valid `GITHUB_TOKEN`; no fake PR URL is stored.
- Codex remediation requires a real Codex CLI; otherwise use OpenAI SDK, Vercel AI SDK, or manual plan-only adapters.
- Telegram sending requires bot credentials; webhook callbacks require `TELEGRAM_WEBHOOK_SECRET` when configured.
- SBOM generation requires Syft; otherwise `sbom_tool_missing` is returned.
- Vercel API lookups require `VERCEL_TOKEN`; local `.vercel/project.json` mapping still works.

## Verification Status

- Implemented and verified locally: local fixture scan, risk score, deterministic remediation, validation with ignored install scripts, local patch artifact, audit receipt, dashboard/API smoke, production `pnpm start`.
- Implemented but requires credentials for live proof: GitHub repo scan against github.com, GitHub PR creation, Telegram send, live Codex remediation.
- Implemented but not live-tested here: OSV-Scanner CLI path, NVD API key path, GitHub Advisory authenticated path.
- Optional/partial: Redis/BullMQ durable queue and Postgres persistence are opt-in Docker paths; GitHub PR rollback closes draft PRs and deletes branches; signed plugin registry, SBOM generation/diff helpers, and deployment URL verification are implemented/config-gated. OpenClaw remains documented/config-gated rather than a native plugin.

## Documentation

See `docs/implementation-notes.md`, `BUILD_PLAN.md`, and `FEATURE_MATRIX.md` first. The rest of `docs/` describes architecture, security, integrations, MCP, plugin SDK, SBOM, testing, deployment, troubleshooting, and demo flow.

Repository layout:

- `docs/` — topic guides (architecture, security, integrations, codex, model-providers, telegram, testing, demo-freeze). `docs/verification/` holds live-integration checklists.
- `docs/spec/` — the numbered product/build specification (`00_`…`19_`).
- `docs/assets/` — images such as `patchpilot-dashboard.png`.
- `apps/` — `web` (Next.js dashboard + API), `worker`, `mcp`.
- `packages/core` — scanning, risk, remediation, Codex, GitHub, Telegram, audit logic.
- `scripts/` — local/live verification entry points (`verify:*`, `demo:live`).
- `tests/fixtures/` — disposable vulnerable fixture used by verifiers.
