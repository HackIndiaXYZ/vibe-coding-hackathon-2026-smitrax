# 19 - QA Checklist

Use this before final submission.

## Product

- [ ] App name consistently says PatchPilot Watch Commander.
- [ ] One-line pitch is clear.
- [ ] Dashboard tells bird's-eye story.
- [ ] Demo is one complete incident loop.
- [ ] No claims of auto-deploying production.

## Integration

- [ ] GitHub repo add works.
- [ ] Local folder add works.
- [ ] OSV scan works or fails clearly.
- [ ] EPSS enrichment works or marks unavailable.
- [ ] KEV enrichment works or marks unavailable.
- [ ] Codex availability check works.
- [ ] Telegram bot sends approval.
- [ ] Approval callback updates app.
- [ ] Audit receipts are generated.

## Security

- [ ] No fake safe status after failed scan.
- [ ] No fake PR URLs.
- [ ] No fake Telegram IDs.
- [ ] No secrets in logs.
- [ ] Local path allowlist enforced.
- [ ] Approval HMAC enforced.
- [ ] Unauthorized Telegram chat cannot approve.
- [ ] PR is draft by default.
- [ ] Auto-merge disabled by default.
- [ ] Production deploy disabled.
- [ ] Codex prompt does not contain secrets.
- [ ] Worker child process uses allowlisted env.

## Testing

- [ ] Unit tests pass.
- [ ] Risk score tests pass.
- [ ] Redaction tests pass.
- [ ] Path safety tests pass.
- [ ] Approval signature tests pass.
- [ ] Scanner adapter tests pass.
- [ ] Worker tests pass.
- [ ] Playwright smoke test passes or documented.

## Demo

- [ ] Demo vulnerable project ready.
- [ ] GitHub token has correct repo permission.
- [ ] Telegram allowed chat ID configured.
- [ ] Codex CLI authenticated.
- [ ] Worker running.
- [ ] Redis running.
- [ ] Database running.
- [ ] Backup screenshots prepared.
- [ ] PR from previous successful run available as backup.
- [ ] Telegram screenshot available as backup.

## Presentation

- [ ] Explain competitor landscape honestly.
- [ ] Say how PatchPilot differs from Dependabot/Snyk/Aikido.
- [ ] Emphasize Codex usage.
- [ ] Emphasize security model.
- [ ] Emphasize open-source plugin ecosystem.
- [ ] Keep the 5-minute story simple.

## Final pitch

PatchPilot is an open-source Watch Commander for CVE and supply-chain response. It watches every GitHub repo, local folder, deployment, and agent config, finds what is affected, lets Codex patch safely, validates the fix, and asks you for phone approval before anything ships.
