# 14 - Test Plan

## Test philosophy

PatchPilot is a security tool. Tests must prove that it does not fake safety, does not leak secrets, and does not take unsafe actions without approval.

## Test categories

1. Unit tests.
2. Integration tests.
3. Worker tests.
4. Security tests.
5. E2E demo tests.

## Unit tests

### Redaction tests

Cases:

- GitHub token redacted.
- OpenAI key redacted.
- Telegram bot token redacted.
- Supabase service key redacted.
- High entropy unknown token redacted.
- Normal text preserved.

Expected:

- No secret value appears in logs.

### Risk score tests

Cases:

1. High CVSS + KEV + production + direct dependency => Critical.
2. Medium CVSS + no EPSS + not deployed => Medium.
3. Unknown severity + production + direct dependency => Medium/High depending score.
4. Known malicious package => Critical.
5. No fix available => still high risk but manual review.

### Fix confidence tests

Cases:

1. Minimal patch + tests/build pass + small diff => high confidence.
2. Major upgrade + missing tests => lower confidence.
3. Validation failed => confidence <= 40.
4. Unrelated files changed => penalty.
5. New install scripts introduced => penalty.

### Path safety tests

Cases:

- Path inside allowlist accepted.
- Path outside allowlist rejected.
- `../` traversal rejected.
- Symlink escaping root rejected.
- Root path rejected unless explicitly allowlisted.

### Approval signature tests

Cases:

- Valid HMAC accepted.
- Modified payload rejected.
- Expired payload rejected.
- Unauthorized chat rejected.
- Already-used approval rejected.

## Integration tests

### OSV API adapter

Use mocked OSV HTTP response in test.

Test package:

- `lodash@4.17.20`.

Expected:

- Finding includes `CVE-2021-23337` or OSV/GHSA equivalent depending OSV response.
- Fixed version includes or recommends `4.17.21` when available from vulnerability data.

Important:
- This is a mocked unit/integration test.
- Do not use mocked response in production path.

### OSV-Scanner CLI adapter

Run only if `osv-scanner` is installed in CI/local.

Test:

- Scan `tests/fixtures/vulnerable-npm-project`.

Expected:

- At least one vulnerability finding for lodash.
- If scanner is absent, test is skipped with explicit message.

### EPSS client

Use mocked EPSS response.

Expected:

- Parses `epss` and `percentile`.
- Handles no record.
- Handles API failure as stale/unavailable signal.

### KEV client

Use small KEV fixture.

Expected:

- Detects CVE present in KEV.
- Returns false for absent CVE.
- Handles malformed feed.

## Worker tests

### Scan job

Setup:

- Create project pointing to vulnerable fixture.
- Enqueue scan.

Expected:

- Scan job completes.
- Finding stored.
- Job events created.
- Project last scan updated.

### Remediation job without Codex

When Codex unavailable:

- Job fails with `codex_unavailable`.
- No PR created.
- Audit receipt created for failure.

### Remediation validation

Create a synthetic changed workspace.

Cases:

- install/test/build pass.
- test fails.
- build script missing.
- package.json missing.

Expected:

- Correct validation statuses.
- Failed required validation blocks PR.

## Security tests

### No auto-merge by default

Setup:

- Remediation passes.
- PR created.
- Telegram approval approved.

Expected:

- PR remains unmerged unless `PATCHPILOT_ALLOW_AUTO_MERGE=true`.

### No secrets in Codex prompt

Setup:

- Environment has fake tokens.
- Build Codex prompt.

Expected:

- Prompt contains no raw tokens.

### No production env in worker

Setup:

- Worker environment has `DATABASE_URL`, `GITHUB_TOKEN`, `TELEGRAM_BOT_TOKEN`.
- Codex child process receives allowlisted env only.

Expected:

- Child env excludes secrets except explicitly safe variables.

### Agent config scanner

Fixtures:

- `.codex/config.toml` containing dangerous bypass.
- `mcp.json` with shell command.
- `.env` committed.

Expected:

- Shield warnings created.

## E2E demo test

Use Playwright.

Scenario:

1. Open app.
2. Add local vulnerable fixture project.
3. Run scan.
4. See finding.
5. Start remediation.
6. If Codex disabled in CI, assert disabled state.
7. In local demo environment with Codex enabled, finish job and see PR/approval.

## Fixture project

Path:

```text
tests/fixtures/vulnerable-npm-project
```

Files:

`package.json`

```json
{
  "name": "patchpilot-vulnerable-demo",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "node test.js",
    "build": "node build.js"
  },
  "dependencies": {
    "lodash": "4.17.20"
  }
}
```

`test.js`

```js
const _ = require("lodash");
if (_.VERSION !== "4.17.20" && _.VERSION !== "4.17.21") {
  throw new Error("unexpected lodash version: " + _.VERSION);
}
console.log("test ok");
```

`build.js`

```js
console.log("build ok");
```

Test setup should generate lockfile with:

```bash
npm install --package-lock-only
```

Commit lockfile if stable, or generate it in test setup.

## Manual demo checklist

Before demo:

- `pnpm dev` running.
- `pnpm worker:dev` running.
- Redis running.
- Postgres running.
- GitHub token configured.
- Telegram bot token configured.
- Allowed Telegram chat ID configured.
- Codex CLI installed and authenticated.
- Vulnerable demo repo available on GitHub or local folder allowlisted.
