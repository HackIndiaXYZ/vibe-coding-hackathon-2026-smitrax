# MCP Server

Run:

```bash
pnpm mcp:dev
```

Verify the Codex plugin wiring:

```bash
pnpm verify:plugin-mcp
```

The verifier reads the local Codex plugin config from
`~/plugins/patchpilot/.mcp.json`, starts the configured MCP server, lists tools,
and calls `patchpilot.get_scanner_coverage`. It prints only counts/status bytes,
not secrets.

Tools exposed:

- `patchpilot.list_projects`
- `patchpilot.scan_project`
- `patchpilot.scan_all`
- `patchpilot.get_threat_radar`
- `patchpilot.get_blast_radius`
- `patchpilot.get_vulnerability`
- `patchpilot.create_patch_job`
- `patchpilot.get_job_status`
- `patchpilot.run_validation`
- `patchpilot.create_pr`
- `patchpilot.send_approval_request`
- `patchpilot.record_audit_receipt`
- `patchpilot.get_audit_receipts`
- `patchpilot.rollback`

Watch Commander command-center tools (real data, env names only — never secrets):

- `patchpilot.get_provider_readiness` — BYO provider readiness + required env names.
- `patchpilot.get_provider_failover_timeline` — recent failover/consent/attempt events.
- `patchpilot.get_scanner_coverage` — scanner matrix + external tool detection.
- `patchpilot.get_watch_status` — watch mode status (enabled, last/next run, counts).
- `patchpilot.get_approval_queue` — pending remediation approvals + provider consents + watch alerts.
- `patchpilot.start_scan` — scan a project by id.
- `patchpilot.request_remediation` — run the failover ladder for a finding (respects consent gates).
- `patchpilot.request_provider_failover` — explicitly trigger the failover ladder for a finding.

Tools call application services or return explicit configuration/tooling messages. They do not return fake scan, PR, approval, validation, or rollback success. `request_remediation`/`request_provider_failover` never silently switch to a lower-trust provider — in `ask` mode they create a Telegram consent request instead.

`patchpilot.create_patch_job` currently creates a manual plan job through the same remediation service. Use the web/API remediation endpoint with `agent: "codex"` when you want the Codex CLI to edit a disposable workspace.
