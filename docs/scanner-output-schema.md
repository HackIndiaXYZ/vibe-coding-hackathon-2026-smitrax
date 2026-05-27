# Scanner Output Schema

Every scanner returns a `ScannerResult`; findings share a `ScannerFinding` shape.

```ts
type ScannerStatus =
  | "enabled" | "disabled" | "tool_missing" | "not_configured"
  | "not_applicable" | "running" | "completed" | "error";

interface ScannerResult {
  scanner: string;          // e.g. "gitleaks", "patchpilot-ci-hardening"
  category: ScannerCategory;
  status: ScannerStatus;
  version?: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  findings: ScannerFinding[];
  errors: string[];
  installHint?: string;     // present when tool_missing
  complete: boolean;        // false on partial/timeout/missing
}

type ScannerCategory =
  | "sca" | "secret" | "sast" | "iac" | "container"
  | "ci" | "agent" | "malware" | "license" | "sbom";

interface ScannerFinding {
  id: string;
  scanner: string;
  category: ScannerCategory;
  severity: "critical" | "high" | "medium" | "low" | "info" | "unknown";
  title: string;
  description: string;
  evidencePath?: string;
  evidenceLine?: number;
  redactedEvidence?: string;  // masked — never the raw secret
  packageName?: string;
  installedVersion?: string;
  fixedVersion?: string;
  advisoryIds?: string[];
  cveIds?: string[];
  source: string;
  confidence: "high" | "medium" | "low";
  remediation?: string;
}
```

Notes:
- `redactedEvidence` is always masked (e.g. `AKI***LE`). Raw secret values are
  never persisted or returned by the API/MCP tools.
- `confidence` is honest: the built-in secret detector is `low`; Gitleaks is `high`.
- `complete: false` means the scan ran but could not cover everything (timeout,
  missing lockfile, or tool unavailable).
