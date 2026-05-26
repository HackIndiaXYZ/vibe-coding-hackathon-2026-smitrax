# MCP Server

Run:

```bash
pnpm mcp:dev
```

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

Tools call application services or return explicit configuration/tooling messages. They do not return fake scan, PR, approval, validation, or rollback success.

`patchpilot.create_patch_job` currently creates a manual plan job through the same remediation service. Use the web/API remediation endpoint with `agent: "codex"` when you want the Codex CLI to edit a disposable workspace.
