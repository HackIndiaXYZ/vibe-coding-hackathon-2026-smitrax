# 16 - Open Source and Plugin SDK

## Open-source positioning

PatchPilot should be open source from day one.

Reason:

- Security tools gain trust through transparency.
- Contributors can add ecosystems and integrations.
- The product naturally needs community adapters.
- Hackathon judges like projects that can grow beyond the demo.

## Repository sections

```text
docs/
  architecture.md
  threat-model.md
  plugin-sdk.md
  contributing.md
  code-of-conduct.md
examples/
  vulnerable-npm-project/
  patchpilot-plugin-template/
plugins/
  vercel/
  trivy/
  openclaw/
  slack/
```

## Contribution areas

Invite contributors to add:

- New scanners.
- New package ecosystems.
- New approval channels.
- New deployment providers.
- New risk signals.
- New agent adapters.
- New MCP tools.
- New UI components.

## Plugin types

### Scanner plugin

Purpose:

- Scan a project source and produce normalized findings.

Interface:

```ts
export interface ScannerPlugin {
  id: string;
  name: string;
  supports(project: Project): Promise<boolean>;
  scan(input: ScanInput): Promise<NormalizedFinding[]>;
}
```

### Risk signal plugin

Purpose:

- Add risk enrichment.

Interface:

```ts
export interface RiskSignalPlugin {
  id: string;
  enrich(finding: NormalizedFinding): Promise<RiskSignal[]>;
}
```

### Agent plugin

Purpose:

- Remediate findings.

Interface:

```ts
export interface AgentPlugin {
  id: string;
  startFix(input: RemediationInput): Promise<RemediationResult>;
}
```

### Approval channel plugin

Purpose:

- Send approval requests.

Interface:

```ts
export interface ApprovalChannelPlugin {
  id: string;
  sendApproval(input: ApprovalInput): Promise<ApprovalSendResult>;
}
```

### Deployment plugin

Purpose:

- Map projects to deployed environments and validate previews.

Interface:

```ts
export interface DeploymentPlugin {
  id: string;
  detect(project: Project): Promise<DeploymentInfo | null>;
  verifyPreview?(input: PreviewInput): Promise<PreviewResult>;
}
```

## Plugin security

Plugins are risky. Required controls:

- Manifest file.
- Declared permissions.
- Version pinning.
- Signature support in phase 2.
- Tool allowlist.
- No access to secrets unless declared.
- Audit plugin actions.

Example plugin manifest:

```json
{
  "id": "patchpilot-plugin-vercel",
  "version": "0.1.0",
  "permissions": [
    "deployment:read",
    "deployment:preview"
  ],
  "entry": "./dist/index.js"
}
```

## MVP plugin stance

Do not build full dynamic plugin loading in the hackathon MVP.

Instead:

- Use internal adapter interfaces.
- Document Plugin SDK.
- Add one example plugin folder if time permits.
- Build dynamic loading after the MVP is stable.

## OpenClaw integration

PatchPilot can become an OpenClaw skill/plugin.

OpenClaw commands:

```text
/patchpilot status
/patchpilot scan
/patchpilot affected
/patchpilot approve <approvalId>
```

MCP tools:

```text
patchpilot.list_projects
patchpilot.list_findings
patchpilot.get_blast_radius
patchpilot.start_codex_fix
patchpilot.approve
```

## License

Recommended license:

- Apache-2.0 or MIT.

For security/compliance projects, Apache-2.0 is often preferred because of patent language.

## README badges

Add later:

- Build status.
- License.
- Security policy.
- Contributions welcome.
- OpenSSF Scorecard if configured.
