# Testing

Run:

```bash
pnpm test
pnpm typecheck
pnpm verify:local-e2e
pnpm smoke:app http://127.0.0.1:3000
```

Current tests cover:

- OSV response normalization.
- OSV-Scanner parser and scan-confidence behavior.
- risk scoring and missing data.
- fix confidence penalties.
- local path allowlist rejection.
- secret redaction.
- approval HMAC validation and expiration.
- audit receipt hash chain.
- validation command pass/fail capture.
- validation safe install mode with `--ignore-scripts`.
- Agent Supply-Chain Shield warnings.
- workspace secret exclusion and cleanup/retention.
- GitHub clone scanning, tokenized remote scrubbing, and retained workspace safety using local repositories.
- Codex unavailable and timeout paths.
- Telegram webhook secret header validation.
- local patch artifacts including untracked files.
- rollback unavailable and applied-patch rollback states.
- mocked NVD and GitHub Advisory enrichment.
- plugin manifest warnings.
- SBOM missing-tool path.

Mocking is limited to tests and local fixtures. HTTP smoke testing is node-based instead of Playwright because the current smoke target is route availability and JSON shape, not browser interaction. Add Playwright when UI workflows need click/form coverage.

For production smoke, run `pnpm build` or `pnpm --filter @patchpilot/web build` immediately before `pnpm start`. `next dev` rewrites `.next` for development and can invalidate a previously generated production `BUILD_ID`.
