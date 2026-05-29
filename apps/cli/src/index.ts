#!/usr/bin/env node
/**
 * PatchPilot CLI — a thin, standalone scanner over @patchpilot/core.
 *
 *   patchpilot scan [path]     Scan a project folder for vulnerable deps (npm + PyPI)
 *   patchpilot --help
 *
 * Honest by design: it queries the real OSV API and tags each finding with the
 * reachability (VEX-lite) signal. No fake results; offline = no findings.
 */
import path from "node:path";
import { detectManifests } from "@patchpilot/core";
import { queryOsvFindings } from "@patchpilot/core";
import { collectFirstPartyImports, reachabilityForFinding } from "@patchpilot/core";

const C = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  orange: "\x1b[38;5;208m", red: "\x1b[31m", yellow: "\x1b[33m", green: "\x1b[32m", gray: "\x1b[90m"
};
const supportsColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const c = (code: string, s: string) => (supportsColor ? code + s + C.reset : s);

const REACH_LABEL: Record<string, string> = {
  imported: "reachable",
  not_imported: "likely unused",
  indirect: "transitive",
  unknown: "unknown"
};

function usage(): void {
  console.log(`
${c(C.orange, "●")} ${c(C.bold, "PatchPilot CLI")} — supply-chain scanner (npm + PyPI)

${c(C.bold, "Usage")}
  patchpilot scan [path]        Scan a project folder (default: current directory)
  patchpilot --help             Show this help

${c(C.bold, "Options")}
  --json                        Output findings as JSON
  --fail-on <level>             Exit non-zero if a finding at/above this severity exists
                                (critical | high | medium | low). Default: never fail.

${c(C.bold, "Examples")}
  npx @patchpilot/cli scan
  npx @patchpilot/cli scan ./my-app --fail-on high
  patchpilot scan . --json > findings.json

Reachability tag: ${c(C.orange, "reachable")} = imported in your source · ${c(C.gray, "likely unused / transitive / unknown")} = de-prioritized.
Runs the real OSV query; no network = no findings. PatchPilot never fakes results.
`);
}

const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, "": 0 };

function severityColor(sev: string): string {
  const s = sev.toLowerCase();
  if (s === "critical" || s === "high") return C.red;
  if (s === "medium") return C.yellow;
  return C.gray;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    usage();
    process.exit(0);
  }
  const command = argv[0];
  if (command !== "scan") {
    console.error(c(C.red, `Unknown command: ${command}`));
    usage();
    process.exit(2);
  }

  const json = argv.includes("--json");
  const failOnIdx = argv.indexOf("--fail-on");
  const failOn = failOnIdx >= 0 ? (argv[failOnIdx + 1] ?? "").toLowerCase() : "";
  const positional = argv.slice(1).filter((a) => !a.startsWith("--") && a !== failOn);
  const target = path.resolve(positional[0] ?? process.cwd());

  if (!json) console.error(c(C.dim, `Scanning ${target} …`));

  const manifests = detectManifests(target);
  if (manifests.length === 0) {
    const msg = "No package.json or requirements.txt found. PatchPilot scans Node.js (npm) and Python (PyPI) projects.";
    if (json) { console.log(JSON.stringify({ error: "unsupported_project", message: msg }, null, 2)); }
    else console.error(c(C.red, msg));
    process.exit(2);
  }

  const result = await queryOsvFindings(target, manifests);
  const imports = collectFirstPartyImports(target);

  const findings = result.findings.map((f) => {
    const reach = reachabilityForFinding(
      { packageName: f.packageName, ecosystem: f.ecosystem, dependencyType: f.dependencyType },
      imports
    );
    return {
      package: f.packageName,
      ecosystem: f.ecosystem,
      currentVersion: f.currentVersion,
      fixedVersion: f.fixedVersion ?? null,
      severity: f.vulnerability.severity || "unknown",
      advisory: f.vulnerability.osvId ?? f.vulnerability.cveIds[0] ?? f.vulnerability.id,
      dependencyType: f.dependencyType,
      reachability: reach.status,
      reachabilityNote: reach.note
    };
  });

  if (json) {
    console.log(JSON.stringify({ target, scanner: result.scanner, scanConfidence: result.scanConfidence, count: findings.length, findings }, null, 2));
  } else {
    printTable(findings, result.scanner);
  }

  if (failOn && SEVERITY_RANK[failOn] !== undefined) {
    const threshold = SEVERITY_RANK[failOn]!;
    const breach = findings.some((f) => (SEVERITY_RANK[f.severity.toLowerCase()] ?? 0) >= threshold);
    if (breach) process.exit(1);
  }
  process.exit(0);
}

function printTable(findings: Array<Record<string, unknown>>, scanner: string): void {
  if (findings.length === 0) {
    console.log(c(C.green, "\n✓ No known vulnerable dependencies found.") + c(C.dim, ` (scanner: ${scanner})\n`));
    return;
  }
  console.log("");
  console.log(c(C.bold, `${findings.length} finding(s)`) + c(C.dim, ` · scanner: ${scanner}`));
  console.log(c(C.gray, "─".repeat(78)));
  for (const f of findings as any[]) {
    const sev = String(f.severity).toUpperCase().padEnd(8);
    const reachTxt = REACH_LABEL[f.reachability] ?? f.reachability;
    const reach = f.reachability === "imported" ? c(C.orange, reachTxt) : c(C.gray, reachTxt);
    const fix = f.fixedVersion ? c(C.green, `→ ${f.fixedVersion}`) : c(C.dim, "manual review");
    console.log(
      `${c(severityColor(String(f.severity)), sev)} ${c(C.bold, f.package)}${c(C.dim, "@" + f.currentVersion)}  ${fix}`
    );
    console.log(`         ${c(C.dim, f.advisory)}  ·  ${reach}  ·  ${c(C.dim, f.ecosystem + "/" + f.dependencyType)}`);
  }
  console.log(c(C.gray, "─".repeat(78)));
  const reachable = (findings as any[]).filter((f) => f.reachability === "imported").length;
  console.log(c(C.dim, `Reachability: `) + c(C.orange, `${reachable} reachable`) + c(C.dim, ` · ${findings.length - reachable} de-prioritized. Fix the reachable ones first.\n`));
}

main().catch((err) => {
  console.error(c(C.red, "PatchPilot CLI error: ") + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
