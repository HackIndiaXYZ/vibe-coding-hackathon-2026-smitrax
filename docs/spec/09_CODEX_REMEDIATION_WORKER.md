# 09 - Codex Remediation Worker

## Purpose

Codex is the visible remediation agent. The MVP must show Codex doing real work:

- Analyze advisory.
- Identify minimal safe update.
- Modify dependency files.
- Fix breakage if caused by upgrade.
- Run validation.
- Summarize changes.
- Prepare PR.

## Integration options

### MVP option: `codex exec`

Use `codex exec` for scripted, non-interactive runs.

Recommended command shape:

```bash
codex exec --cd "<workspace>" --json "<task prompt>"
```

Check installed Codex CLI flags using:

```bash
codex exec --help
```

Do not use dangerous bypass flags except inside disposable local-only runner with explicit dev config.

### Phase 2 option: Codex SDK

Use `@openai/codex-sdk` server-side for tighter integration and streaming JSONL events.

### CI option: Codex GitHub Action

Use `openai/codex-action@v1` later to review PRs or fix CI failures inside GitHub Actions.

## Worker inputs

The worker must create a context file:

`patchpilot-context.json`

```json
{
  "project": {
    "name": "chat-app",
    "sourceType": "github",
    "owner": "example",
    "repo": "chat-app",
    "baseBranch": "main"
  },
  "finding": {
    "packageName": "lodash",
    "ecosystem": "npm",
    "currentVersion": "4.17.20",
    "fixedVersion": "4.17.21",
    "vulnerabilityIds": ["CVE-2021-23337"],
    "summary": "Lodash versions prior to 4.17.21 are vulnerable to command injection via template."
  },
  "constraints": {
    "makeSmallestSafeChange": true,
    "doNotRefactorUnrelatedCode": true,
    "doNotTouchSecrets": true,
    "stopBeforeDeployment": true
  },
  "validation": {
    "install": "npm install",
    "test": "npm test",
    "build": "npm run build"
  }
}
```

## Codex task prompt

Use the prompt in `18_AGENT_PROMPTS.md`.

## Required job events

Emit structured events:

- `remediation.workspace.created`
- `remediation.source.cloned`
- `codex.started`
- `codex.event`
- `codex.completed`
- `git.diff.computed`
- `validation.install.started`
- `validation.install.completed`
- `validation.test.started`
- `validation.test.completed`
- `validation.build.started`
- `validation.build.completed`
- `github.branch.created`
- `github.pr.created`
- `telegram.approval.sent`
- `audit.receipt.created`

## Files changed policy

Allowed files for npm dependency remediation:

- `package.json`
- `package-lock.json`
- `pnpm-lock.yaml`
- `yarn.lock`
- Source files only if needed due to breaking changes.
- Test files only if needed to align with changed API, not to weaken tests.

Forbidden changes:

- `.env`
- Secret files.
- CI tokens.
- Unrelated refactors.
- Formatting entire repo.
- Removing tests to pass validation.
- Changing deployment config unless explicitly needed.

## Validation runner

Validation command selection:

1. If `package-lock.json` exists: prefer `npm ci` for clean install.
2. If lockfile changed and `npm ci` fails because lockfile/package mismatch, run `npm install` during the fix job and ensure lockfile is committed.
3. Run `npm test` only if `scripts.test` exists.
4. Run `npm run build` only if `scripts.build` exists.

Missing script behavior:

- Mark `skipped_no_script`.
- Do not mark as pass.
- Reduce fix confidence.

## PR body template

```markdown
# PatchPilot security fix

## Finding

- Package: lodash
- Current version: 4.17.20
- Fixed version: 4.17.21
- Vulnerability: CVE-2021-23337
- Risk score: 78 / 100 High

## What changed

- Updated lodash to 4.17.21.
- Updated lockfile.

## Validation

| Command | Result |
|---|---|
| npm install | passed |
| npm test | passed |
| npm run build | passed |

## Agent summary

Codex applied the smallest safe dependency update and did not change unrelated files.

## Approval

Status: awaiting phone approval

## Audit receipt

Receipt: rec_123
```

## Failure behavior

If Codex fails:

- Store logs.
- Mark job `failed`.
- Suggest manual review.
- Do not create PR unless user chose manual-review PR mode.

If validation fails:

- Give Codex one retry with validation failure logs.
- If retry fails, mark `validation_failed`.
- Do not ask phone approval as safe fix.

## Security

Never include:

- API keys.
- Telegram token.
- GitHub token.
- Supabase service key.
- User secrets.

Do not pass `process.env` into Codex.
