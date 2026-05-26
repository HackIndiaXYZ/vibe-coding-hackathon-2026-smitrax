# Architecture

PatchPilot has four executable surfaces:

- `apps/web`: Next.js dashboard and API route handlers.
- `packages/core`: scanner, risk, inventory, audit, approval, validation, integration, and plugin services.
- `apps/worker`: local inline worker entrypoint for scan-all. Redis/BullMQ is not implemented.
- `apps/mcp`: stdio MCP server exposing PatchPilot tools.

State is stored in a local JSON file by `JsonDatabase`. Services are written so a Postgres/Supabase adapter can replace this without changing API or MCP tool behavior.

Data flow:

1. Add project.
2. Validate GitHub credentials or local path allowlist.
3. Detect package manager and stack.
4. Scan npm direct dependencies through OSV API.
5. Enrich CVEs with EPSS and CISA KEV.
6. Score risk and store findings.
7. Render dashboard, threat radar, and blast radius from persisted records.
8. Remediation creates a real Codex job only when Codex is available; otherwise records `codex_not_executed`.
9. Approval callbacks require signed, unexpired HMAC tokens.
10. State-changing actions produce audit receipts.
