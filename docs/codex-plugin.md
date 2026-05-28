# Codex Plugin

PatchPilot has a separate local Codex plugin at:

```text
<your-codex-plugins-dir>\patchpilot
```

The plugin is intentionally separate from PatchPilot's in-app plugin registry.
Its job is to give Codex project context and expose the PatchPilot MCP server
with one command:

```json
{
  "mcpServers": {
    "patchpilot": {
      "command": "pnpm",
      "args": ["--dir", "<absolute path to your patchpilot checkout>", "mcp:dev"]
    }
  }
}
```

## Verification

Run:

```bash
pnpm verify:plugin-mcp
```

Expected result:

- The verifier finds `~/plugins/patchpilot/.mcp.json`.
- The MCP server starts through the plugin command.
- At least 20 PatchPilot tools are listed.
- Required command-center tools are present:
  `patchpilot.get_provider_readiness`, `patchpilot.get_scanner_coverage`,
  `patchpilot.get_watch_status`, `patchpilot.get_approval_queue`,
  `patchpilot.request_remediation`.
- `patchpilot.get_scanner_coverage` returns a non-empty payload.

The verifier does not print secret values. It reports plugin/config problems as
`plugin_missing`, `mcp_server_missing`, or `incomplete` instead of pretending the
plugin works.

## Safety

- The plugin does not auto-merge, auto-deploy, or bypass PatchPilot approval
  gates.
- MCP tools use PatchPilot services and preserve honest `not_configured` and
  `tool_missing` states.
- Lower-trust provider fallback still follows the configured consent policy.
