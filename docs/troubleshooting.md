# Troubleshooting

`local_roots_not_configured`:

Set `PATCHPILOT_LOCAL_ROOTS` to one or more parent folders separated by the OS path delimiter.

`github_token_missing`:

Set `GITHUB_TOKEN` with repo metadata, contents, and pull request permissions.

`codex_unavailable`:

Install and authenticate Codex CLI, or set `CODEX_ENABLED=false` to make remediation plan-only.

`telegram_not_configured`:

Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_IDS`, and `APPROVAL_HMAC_SECRET`.

`sbom_tool_missing`:

Install Syft or set `SYFT_BIN` to its executable path.

OSV scan failed:

PatchPilot cannot mark a project safe after an OSV failure. Retry after network/API availability is restored.
