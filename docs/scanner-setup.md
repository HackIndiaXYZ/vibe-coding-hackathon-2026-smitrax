# Scanner Setup

All external scanners are optional. Until installed they report `tool_missing`
with the hint below. Built-in scanners (CI hardening, agent/MCP config,
lightweight secrets, suspicious packages) need no installation.

Detection requires the configured command to exist and return a usable
`--version` response. A broken or hanging executable is reported as
`tool_missing` so the dashboard does not show a fake green scanner.

| Tool | Enable env (default) | Path env | Install |
|---|---|---|---|
| OSV-Scanner | `PATCHPILOT_SCANNER_OSV_ENABLED=true` | `PATCHPILOT_SCANNER_OSV_SCANNER_PATH=osv-scanner` | https://google.github.io/osv-scanner/installation/ |
| Gitleaks | `PATCHPILOT_SCANNER_GITLEAKS_ENABLED=true` | `PATCHPILOT_SCANNER_GITLEAKS_PATH=gitleaks` | https://github.com/gitleaks/gitleaks#installing |
| Semgrep | `PATCHPILOT_SCANNER_SEMGREP_ENABLED=true` | `PATCHPILOT_SCANNER_SEMGREP_PATH=semgrep` | https://semgrep.dev/docs/getting-started/ |
| Trivy | `PATCHPILOT_SCANNER_TRIVY_ENABLED=true` | `PATCHPILOT_SCANNER_TRIVY_PATH=trivy` | https://aquasecurity.github.io/trivy/latest/getting-started/installation/ |
| Syft | `PATCHPILOT_SCANNER_SYFT_ENABLED=false` | `PATCHPILOT_SCANNER_SYFT_PATH=syft` | https://github.com/anchore/syft#installation |

Other config:

```
PATCHPILOT_SCANNER_TIMEOUT_MS=120000      # per-tool timeout
PATCHPILOT_MALICIOUS_PACKAGES_DIR=        # OpenSSF malicious-packages data dir (enables "malicious" labels)
PATCHPILOT_LICENSE_POLICY_PATH=           # optional license policy file
```

Verify what is detected:

```bash
pnpm verify:scanner-tools
```

Semgrep note: on this native Windows/Python 3.14 verification host the pip
launcher hung. Use WSL, Linux, macOS, Docker, or point
`PATCHPILOT_SCANNER_SEMGREP_PATH` at a working Semgrep command.

Disabling a tool (`*_ENABLED=false`) shows it as `disabled` rather than
`tool_missing` — an explicit operator choice, not a missing dependency.
