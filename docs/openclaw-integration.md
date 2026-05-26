# OpenClaw Integration

OpenClaw is optional and currently configuration-gated.

PatchPilot exposes a real MCP server that OpenClaw can connect to in MCP mode. The app reports OpenClaw as available only when `OPENCLAW_ENABLED=true` and the OpenClaw CLI is installed.

Suggested commands:

- `/patchpilot status`
- `/patchpilot scan`
- `/patchpilot affected`
- `/patchpilot approve <approvalId>`

No WhatsApp/OpenClaw success is shown unless the external bridge is configured.
