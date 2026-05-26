# GitHub Integration

GitHub operations use Octokit and require `GITHUB_TOKEN` for github.com repositories.

Implemented:

- Repo metadata validation.
- Clone/fetch into disposable scan and remediation workspaces.
- Draft PR creation adapter.
- Clear `github_token_missing` and `github_pr_create_failed` errors.
- Remote URL token scrubbing after clone/push, especially when workspaces are retained.
- Patch branch creation.
- Commit/push orchestration.
- PR body generation from completed validation results and audit receipt.

PatchPilot never stores fake PR URLs.

Verified locally:

- Missing-token failure for github.com repositories.
- Clone/scan path using a local Git repository fixture.
- Tokenized remote scrubbing after clone.
- Retained workspace remote safety.

Implemented but not live-tested in this verification sprint:

- GitHub.com scan with `GITHUB_TOKEN`.
- Draft PR creation and push to a disposable branch.

Use `docs/verification/live-integrations.md` before running any live GitHub test.
