# 12 - UI/UX Spec

## Visual direction

Dark, premium, command-center UI.

Style:

- Near-black background.
- Green/mint accent for safe/active states.
- Amber for warning.
- Red for critical.
- Thin-line icons.
- High negative space.
- Cards with subtle borders.
- Terminal/mission-control style.

## Main navigation

- Watch Commander
- Threat Radar
- Projects
- Findings
- Remediation Jobs
- Approvals
- Audit Receipts
- Settings

## Page 1 - Watch Commander dashboard

Top metrics:

```text
Projects watched: 47
GitHub repos: 32
Local folders: 11
Vercel linked: 4
Affected projects: 7
Critical production risks: 1
Codex jobs running: 3
PRs awaiting approval: 2
```

Main sections:

1. Threat Radar.
2. Affected Projects table.
3. Blast Radius Map.
4. Codex Remediation Timeline.
5. Approvals waiting.
6. Agent Supply-Chain Shield.

### Affected Projects table

Columns:

- Project
- Source
- Deployment
- Risk
- Package
- Fix
- Status
- Action

Example rows:

```text
chat-app       GitHub   Vercel prod   High      lodash       PR ready       Review
zk-auth-demo   Local    Not deployed   Medium    minimist     Codex running  Open
api-server     GitHub   VPS prod       Critical  express dep  Needs review   Fix
```

## Page 2 - Threat Radar

Cards:

- New advisories checked.
- Relevant to your stack.
- KEV hits.
- High EPSS.
- Malicious package warnings.
- Stale feed warnings.

Feed item example:

```text
CVE-2021-23337
Package: lodash
Relevant projects: 2
EPSS: available
KEV: no
Fix: 4.17.21
```

## Page 3 - Project detail

Sections:

- Project metadata.
- Source and deployment.
- Last scan result.
- Open findings.
- Agent config warnings.
- Scan history.
- Remediation history.

Actions:

- Scan now.
- Start fix.
- Mark production exposed.
- Remove project.

## Page 4 - Finding detail

Show:

- Vulnerability ID.
- Package/version.
- Summary.
- Affected project.
- Risk score explanation.
- Fix strategy.
- Blast radius.
- Codex remediation button.
- Previous remediations.

Risk explanation card:

```text
Risk: 78/100 High

Why:
+ CVSS high
+ Direct dependency
+ Production deployment linked
+ Fix available
- Not in CISA KEV
```

## Page 5 - Remediation job detail

Show timeline:

```text
✓ Workspace created
✓ Repo cloned
✓ Codex started
✓ Dependency updated
✓ npm install passed
✓ npm test passed
✓ npm run build passed
✓ PR created
⏳ Waiting for Telegram approval
```

Show:

- Files changed.
- Diff summary.
- Validation logs.
- Fix confidence.
- PR link.
- Approval status.

## Page 6 - Approvals

Table:

- Approval ID.
- Project.
- Risk.
- PR.
- Channel.
- Sent at.
- Expires at.
- Status.
- Actions.

## Page 7 - Audit receipt

Receipt card:

```text
Receipt ID: rec_123
Action: remediation.pr_created
Actor: system
Project: chat-app
Finding: CVE-2021-23337 / lodash
Agent: Codex
Validation: passed
PR: https://github.com/example/chat-app/pull/12
Created: 2026-05-26T12:00:00Z
```

## Empty states

No projects:

```text
No projects watched yet.
Add a GitHub repo or local folder to start scanning.
```

No findings:

```text
No open findings from the latest successful scan.
Last scan: 2 minutes ago.
```

External service failure:

```text
OSV scan failed.
PatchPilot cannot confirm this project is safe. Retry scan or check scanner configuration.
```

## Demo copy

Use these exact feature names:

- Watch Commander
- Threat Radar
- Blast Radius Map
- Codex Remediation Timeline
- Fix Confidence Score
- Package Quarantine Shield
- Agent Supply-Chain Shield
- Phone Approval Gate
- Audit Receipt
- OpenClaw Bridge
