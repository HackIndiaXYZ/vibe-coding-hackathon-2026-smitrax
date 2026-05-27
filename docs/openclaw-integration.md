# OpenClaw Integration

OpenClaw is optional and currently configuration-gated.

PatchPilot exposes a real MCP server that OpenClaw can connect to in MCP mode. The app reports OpenClaw as available only when `OPENCLAW_ENABLED=true` and the OpenClaw CLI is installed.

Through the MCP server, OpenClaw gets the same Watch Commander tools the
dashboard uses (all real, no secrets):

- `patchpilot.get_threat_radar`, `patchpilot.get_scanner_coverage`,
  `patchpilot.get_watch_status`, `patchpilot.get_provider_readiness`,
  `patchpilot.get_provider_failover_timeline`, `patchpilot.get_approval_queue`,
  `patchpilot.get_audit_receipts`.
- `patchpilot.start_scan`, `patchpilot.request_remediation`,
  `patchpilot.request_provider_failover` — these respect approval/consent gates
  and never auto-merge or auto-deploy.

Suggested chat commands (map to the tools above):

- `/patchpilot status` → watch status + provider readiness
- `/patchpilot scan` → start scan
- `/patchpilot affected` → threat radar / blast radius
- `/patchpilot approve <approvalId>` → approval queue action

No WhatsApp/OpenClaw success is shown unless the external bridge is configured
(`OPENCLAW_ENABLED=true` + OpenClaw CLI installed).
