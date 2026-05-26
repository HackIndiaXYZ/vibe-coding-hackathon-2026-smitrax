# 02 - Research Landscape and References

Prepared: 2026-05-26

This file records the current landscape and resources used to design PatchPilot. It should be kept inside the repository so future contributors understand why the product is differentiated.

## Market reality

PatchPilot must not be positioned as "AI Dependabot." That space is already active.

Instead, PatchPilot should be positioned as a cross-project Watch Commander:

- Dependabot and similar tools are repo-centric.
- PatchPilot is portfolio-centric and local/deployment-aware.
- PatchPilot adds phone approval, Codex timelines, audit receipts, package quarantine, and agent supply-chain protection.

## Existing tools and inspiration

### GitHub Dependabot + AI agents

GitHub announced that Dependabot alerts can be assigned to AI agents including Copilot, Claude, and Codex. The assigned agent analyzes the alert, opens a draft PR, and tries to resolve test failures.

Reference:
- https://github.blog/changelog/2026-04-07-dependabot-alerts-are-now-assignable-to-ai-agents-for-remediation/

What to learn:
- Alert-to-agent-to-draft-PR flow.
- Codex can be explicitly visible in remediation.
- PatchPilot must differentiate by covering cross-project inventory, local folders, deployment awareness, mobile approval, and audit receipts.

### Snyk Fix PRs

Snyk Fix PRs are automatic or manual pull requests to resolve issues with available fixes. They trigger from scans/tests and integrate with SCM.

References:
- https://docs.snyk.io/scan-with-snyk/pull-requests
- https://docs.snyk.io/scan-with-snyk/pull-requests/snyk-pull-or-merge-requests/enable-automatic-fix-prs

What to learn:
- Automatic fix PR UX.
- SCM integration details.
- PatchPilot should show validation and approval status clearly.

### Aikido AutoFix

Aikido AutoFix creates PRs that fix open-source dependency vulnerabilities. It prefers minimum required upgrades and patch/minor bumps over major bumps, groups fixes per repo/lockfile, and also offers AI fixes for SAST/IaC.

References:
- https://help.aikido.dev/autofix-and-remediation/scope/autofix-for-open-source-dependencies
- https://www.aikido.dev/code/autofix
- https://help.aikido.dev/autofix-and-remediation/scope/ai-autofix-for-sast-and-iac-issues

What to learn:
- Minimal safe upgrade principle.
- Keep PRs focused and mergeable.
- Preview changes before applying.
- PatchPilot should include Fix Strategy and Fix Confidence.

### Mobb Bugsy / Mobb MCP

Mobb has an automatic vulnerability remediation CLI and MCP support.

References:
- https://github.com/mobb-dev/bugsy
- https://docs.mobb.ai/mobb-user-docs/getting-started/mobb-cli

What to learn:
- Auto-remediation can be exposed as CLI/MCP.
- PatchPilot's own MCP server is a strong extension path.

### Renovate

Renovate provides configurable dependency update automation, dashboards, grouped updates, schedules, and presets.

References:
- https://docs.renovatebot.com/configuration-options/
- https://docs.renovatebot.com/key-concepts/dashboard/

What to learn:
- Dependency dashboard approval pattern.
- Configuration presets.
- Grouping updates and avoiding PR noise.
- PatchPilot should avoid creating noisy PRs.

### Dependabot Core

Dependabot Core is the library behind Dependabot security/version updates and supports many ecosystems.

Reference:
- https://github.com/dependabot/dependabot-core

What to learn:
- Multi-ecosystem architecture.
- For MVP, PatchPilot should not replicate all ecosystems. Start with npm/Node.js.

### OSV and OSV-Scanner

OSV is an open-source vulnerability database. The OSV API supports package/version queries and batch queries. OSV-Scanner finds vulnerabilities in project dependencies and has experimental guided remediation.

References:
- https://osv.dev/
- https://google.github.io/osv.dev/api/
- https://google.github.io/osv.dev/post-v1-querybatch/
- https://github.com/google/osv-scanner
- https://google.github.io/osv-scanner/usage/

Important security note:
- OSV-Scanner warns that guided remediation can be risky on untrusted projects because package managers may execute scripts or follow external registries.
- PatchPilot must use two-pass scanning: metadata-only first, isolated validation second.

### NVD CVE API

NVD's CVE API retrieves individual CVEs and CVE collections.

Reference:
- https://nvd.nist.gov/developers/vulnerabilities

What to learn:
- Use NVD for enrichment, not as the only source.
- NVD data can lag; combine with OSV, GitHub advisories, EPSS, and KEV.

### EPSS

EPSS provides a daily probability score and percentile for CVEs, accessible via API and CSV. It helps prioritize vulnerabilities based on likelihood of exploitation.

References:
- https://www.first.org/epss/
- https://www.first.org/epss/api
- https://www.first.org/epss/user-guide
- https://www.first.org/epss/data_stats

What to learn:
- PatchPilot Risk Score should include EPSS probability and percentile.
- EPSS should never be the only risk factor; combine with deployment status and fix availability.

### CISA Known Exploited Vulnerabilities

CISA KEV tracks vulnerabilities known to be exploited in the wild.

References:
- https://www.cisa.gov/known-exploited-vulnerabilities-catalog
- https://github.com/cisagov/kev-data
- https://nvd.nist.gov/general/news/cisa-exploit-catalog

What to learn:
- A CVE in KEV should raise risk sharply.
- PatchPilot should show "actively exploited" when present in KEV.

### OpenSSF malicious packages and package analysis

OpenSSF malicious-packages aggregates reports of malicious open-source packages in OSV format. OpenSSF Package Analysis observes package behavior such as file access, network connections, and commands.

References:
- https://github.com/ossf/malicious-packages
- https://openssf.org/blog/2023/10/12/introducing-openssfs-malicious-packages-repository/
- https://github.com/ossf/package-analysis
- https://openssf.org/projects/package-analysis/

What to learn:
- Not all supply-chain attacks are CVEs.
- PatchPilot should include Package Quarantine Shield for malicious/fresh package risk.

### Socket

Socket focuses on blocking zero-day supply-chain attacks and flags malicious packages quickly.

Reference:
- https://socket.dev/

What to learn:
- Use Socket-style heuristics in PatchPilot even if not integrating their API.
- Watch for scripts, freshness, maintainer changes, and suspicious behavior.

### Trivy

Trivy scans for vulnerabilities, IaC issues, SBOM discovery, secrets, cloud/Kubernetes risks, containers, filesystems, and repositories.

References:
- https://trivy.dev/
- https://github.com/aquasecurity/trivy

What to learn:
- Future scanner adapter pattern.
- MVP can start with OSV, later add Trivy adapter.

### Syft and Grype

Syft generates SBOMs from container images and filesystems. Grype scans images, filesystems, and SBOMs for vulnerabilities.

References:
- https://github.com/anchore/syft
- https://github.com/anchore/grype
- https://anchore.com/opensource/

What to learn:
- Before/after SBOM diff is a strong phase-2 feature.
- For MVP, design data model to support SBOM later.

### OWASP Dependency-Track

Dependency-Track is a continuous SBOM analysis platform for identifying and reducing software supply-chain risk.

References:
- https://dependencytrack.org/
- https://github.com/DependencyTrack/dependency-track
- https://owasp.org/www-project-dependency-track/

What to learn:
- Portfolio-level component/risk view.
- PatchPilot's Watch Commander should feel like a lighter, developer-first portfolio risk dashboard.

### GitHub REST API and Octokit

GitHub REST API supports Dependabot alerts and pull request operations. Octokit is the official GitHub SDK for JavaScript.

References:
- https://docs.github.com/en/rest/dependabot/alerts
- https://docs.github.com/rest/reference/pulls
- https://octokit.github.io/rest.js/
- https://docs.github.com/en/rest/guides/scripting-with-the-rest-api-and-javascript

What to learn:
- Use Octokit for repo/branch/PR operations.
- Use GitHub App tokens where possible, or personal tokens for MVP with minimal scopes.

### Vercel REST API

Vercel REST API can manage deployments, projects, custom domains, secrets, and environment variables. Vercel CLI can deploy/link local projects.

References:
- https://vercel.com/docs/rest-api
- https://vercel.com/docs/deployments
- https://vercel.com/docs/cli/deploy
- https://vercel.com/docs/deployments/managing-deployments

What to learn:
- MVP should detect Vercel mapping from `.vercel/project.json` or repo metadata.
- Do not auto-deploy production in MVP.

### OpenAI Codex

Codex can be used non-interactively with `codex exec`; the SDK allows server-side programmatic control; the GitHub Action runs Codex in CI/CD; skills package repeatable task workflows.

References:
- https://developers.openai.com/codex/noninteractive
- https://developers.openai.com/codex/cli/reference
- https://developers.openai.com/codex/sdk
- https://developers.openai.com/codex/github-action
- https://developers.openai.com/codex/skills
- https://developers.openai.com/codex/config-reference
- https://github.com/openai/codex
- https://github.com/openai/codex-action

What to learn:
- Use `codex exec` for MVP.
- Log JSONL events where available.
- Use SDK later for tighter app integration.
- Use skills later for reusable CVE remediation workflows.

### OpenClaw

OpenClaw is a self-hosted gateway connecting chat apps such as WhatsApp, Telegram, Slack, Signal, and others to AI assistants. It supports plugins and MCP mode with `openclaw mcp serve`.

References:
- https://openclaw.ai/
- https://docs.openclaw.ai/
- https://docs.openclaw.ai/cli/mcp
- https://docs.openclaw.ai/plugins/bundles
- https://github.com/openclaw/openclaw

What to learn:
- PatchPilot can integrate as an OpenClaw plugin or MCP server.
- Keep OpenClaw as phase 2 or bonus; Telegram direct integration is easier for MVP.

### GitHub MCP security scanning

GitHub MCP Server added secret scanning GA and dependency scanning public preview for AI coding agents and MCP-compatible tools.

References:
- https://github.blog/changelog/2026-05-05-secret-scanning-with-github-mcp-server-is-now-generally-available/
- https://github.blog/changelog/2026-05-05-dependency-scanning-with-github-mcp-server-is-in-public-preview/
- https://docs.github.com/code-security/how-tos/use-ghas-with-ai-coding-agents/scan-for-secrets-with-github-mcp-server

What to learn:
- Agent-side scanning is a current 2026 direction.
- PatchPilot's Agent Supply-Chain Shield is timely and defensible.

### MCP Scanner by Cisco AI Defense

Cisco AI Defense MCP Scanner scans MCP servers/tools for security findings using Yara, LLM-as-judge, and Cisco AI Defense engines.

References:
- https://github.com/cisco-ai-defense/mcp-scanner
- https://blogs.cisco.com/ai/securing-the-ai-agent-supply-chain-with-ciscos-open-source-mcp-scanner

What to learn:
- MCP security scanning is a real need.
- PatchPilot can initially do config review and later integrate full MCP scanning.

## Differentiation summary

PatchPilot should differentiate through:

1. Cross-project Watch Commander dashboard.
2. Local folder and deployment awareness.
3. Threat Radar for CVEs and malicious-package risk.
4. Codex remediation timeline.
5. Phone Approval Gate.
6. Audit Receipts.
7. Agent Supply-Chain Shield.
8. Open-source plugin/MCP ecosystem.
