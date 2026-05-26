# 01 - Product Brief

## Project title

PatchPilot Watch Commander

## One-line pitch

PatchPilot is an open-source Watch Commander for CVE and supply-chain response: it watches every GitHub repo, local folder, deployment, and agent config, finds what is affected, lets Codex patch safely, validates the fix, and asks for phone approval before anything ships.

## Short description

PatchPilot is a phone-first security command center for modern developers. It continuously checks trusted vulnerability and supply-chain sources, scans connected GitHub repositories and local folders, identifies affected projects, ranks risk using real exploit intelligence, assigns Codex to generate fixes, validates builds and tests, creates pull requests, and sends a mobile approval request before merge or deployment.

## Why this is not just another dependency bot

Most dependency bots work repo-by-repo. PatchPilot is designed as a cross-project incident commander.

PatchPilot focuses on:

- Bird's-eye inventory across GitHub repositories, local folders, deployments, and private workspaces.
- Threat Radar for fresh advisories and malicious-package risk.
- Blast Radius Map showing every affected project for a vulnerability.
- Codex Remediation Timeline showing agent actions and validation.
- Phone Approval Gate through Telegram and later OpenClaw/WhatsApp.
- Audit Receipts for every agent action.
- Agent Supply-Chain Shield for Codex, MCP, OpenClaw, plugin, secret, and token risk.

## Problem

Modern developers often manage dozens of side projects and team projects spread across:

- GitHub repositories.
- Local laptop folders.
- Vercel apps.
- VPS/server deployments.
- AI-generated project folders.
- Private workspaces.

When a CVE or supply-chain attack happens, the problem is not only "update a dependency." The real problem is:

1. Which projects are affected?
2. Which affected projects are actually deployed?
3. Which ones are internet-facing?
4. Which dependencies are direct vs transitive?
5. Is a safe patch available?
6. Will the patch break the app?
7. Who approves the fix?
8. Can the change be audited or rolled back?

## Solution

PatchPilot turns CVE response into a single command-center workflow:

1. Watch security intelligence sources.
2. Maintain a project inventory.
3. Scan dependencies and lockfiles.
4. Enrich findings with exploit intelligence.
5. Rank risk.
6. Start agent-based remediation.
7. Validate install/test/build.
8. Create pull requests.
9. Ask for phone approval.
10. Generate audit receipts.

## Core product modules

### Watch Commander

Global dashboard showing:

- Total projects watched.
- Safe vs affected projects.
- New advisories checked.
- Projects affected.
- Critical production risk.
- Codex jobs running.
- PRs awaiting approval.
- Recent audit receipts.

### Threat Radar

Daily security feed that summarizes:

- New advisories.
- Relevant advisories for the user's stack.
- CISA KEV hits.
- High EPSS vulnerabilities.
- Malicious package warnings.
- Suspicious new package versions.

### Blast Radius Map

For each vulnerability:

- Affected GitHub repos.
- Affected local folders.
- Affected deployments.
- Direct vs transitive usage.
- Fix availability.
- PR/fix status.

### Codex Remediation Timeline

For every remediation job:

- Repo cloned.
- Advisory loaded.
- Lockfile analyzed.
- Minimal safe version selected.
- Files changed.
- Commands run.
- Tests/build result.
- PR creation result.
- Approval status.

### Package Quarantine Shield

Risk layer for non-CVE supply-chain threats:

- Fresh package/version published very recently.
- Install/postinstall scripts present.
- Known malicious package report.
- Maintainer or package metadata anomaly.
- Package not present in lockfile before proposed update.
- Suspicious downgrade or package substitution.

### Agent Supply-Chain Shield

Protects the AI remediation environment:

- Codex config review.
- MCP server review.
- OpenClaw plugin risk review.
- GitHub Actions workflow risk.
- Secret scanning before PR.
- Token permission warnings.
- Dangerous command detection.

### Phone Approval Gate

Approval actions:

- Approve PR.
- Reject.
- Retry safer fix.
- Open diff.
- Ask Codex why.
- Mark manual review.
- Rollback, phase 2.

## MVP success statement

A judge should see PatchPilot detect a vulnerable dependency across projects, rank risk, send Codex to fix one repo, validate the fix, create a PR, and ask for mobile approval. That is the core demo.
