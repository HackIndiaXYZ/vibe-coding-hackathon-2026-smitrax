# 10 - GitHub, Local, and Vercel Integrations

## GitHub integration

Use Octokit.

MVP authentication options:

1. Personal access token for local hackathon demo.
2. GitHub App installation token for production-ready architecture.

Recommended MVP token scopes:

- Public repos:
  - `public_repo` if using classic PAT, or fine-grained repo contents/pull requests.
- Private repos:
  - contents read/write for selected repos.
  - pull requests read/write for selected repos.
  - metadata read.

Avoid broad organization admin permissions.

## GitHub operations

### Validate repo access

- Fetch repo metadata.
- Store default branch.
- Store clone URL.

### Clone repo

For remediation:

```bash
git clone --depth=1 --branch <defaultBranch> <repoUrl> <workspace>
```

Use tokenized remote carefully; never log tokenized URL.

### Create branch

Branch naming:

```text
patchpilot/<package-name>-<short-vuln-id>-<short-job-id>
```

Example:

```text
patchpilot/lodash-cve-2021-23337-rem123
```

### Commit

Commit message:

```text
fix(security): patch lodash vulnerability CVE-2021-23337
```

### Create PR

Use GitHub REST Pulls API through Octokit.

PR title:

```text
fix(security): patch lodash vulnerability CVE-2021-23337
```

PR default:

- Draft: true.
- Base: default branch.
- Head: patch branch.

### Dependabot alerts

Phase 2:

- Read Dependabot alerts from GitHub REST API.
- Import alerts into PatchPilot findings.
- Avoid duplicate findings when OSV and Dependabot report the same issue.

## Local folder integration

### Allowlist

Use `PATCHPILOT_LOCAL_ROOTS`:

```text
C:/Users/Mohith S/Desktop
/home/mohith/projects
```

Only allow paths inside these roots.

### Path safety algorithm

1. Resolve requested path with `realpath`.
2. Resolve each allowlist root with `realpath`.
3. Ensure requested path starts with an allowlist root.
4. Reject if any path segment points outside root through symlink.
5. Reject system roots like `/`, `C:\`, home directory root unless explicitly configured.

### Local git behavior

If local project is a git repo:

- Create local branch.
- Apply fix.
- Commit to branch if user allows.
- Produce patch file.

If not a git repo:

- Copy to temp workspace.
- Produce patch/diff.
- Ask user to apply manually.

### Local privacy

- Do not upload source code to external APIs.
- OSV API fallback sends only package names and versions.
- Codex may read source locally through CLI; make clear to user depending on their Codex configuration/model provider.

## Vercel integration

MVP: detect mapping only.

### Detection

Check for:

```text
.vercel/project.json
```

Use:

- `projectId`
- `orgId`

If GitHub repo has known Vercel project/deployment URL, allow manual mapping.

### Production exposure

Set `productionExposed = true` if:

- User manually marks production.
- Vercel production URL exists.
- Project has a public domain configured.

### Phase 2

Use Vercel API to:

- List deployments.
- Verify preview deployment.
- Check latest production deployment.
- Fetch deployment status.
- Trigger preview deployments only after fix branch.

Do not production deploy in MVP.

## Environment variables

GitHub:

```text
GITHUB_TOKEN
GITHUB_APP_ID
GITHUB_APP_PRIVATE_KEY
GITHUB_APP_INSTALLATION_ID
```

Local:

```text
PATCHPILOT_LOCAL_ROOTS
```

Vercel:

```text
VERCEL_TOKEN
VERCEL_TEAM_ID
```

## Failure states

GitHub:

- `github_unauthorized`
- `github_repo_not_found`
- `github_rate_limited`
- `github_pr_create_failed`

Local:

- `local_path_not_allowlisted`
- `local_path_not_found`
- `local_not_git_repo`
- `local_permission_denied`

Vercel:

- `vercel_token_missing`
- `vercel_project_not_linked`
- `vercel_api_failed`
