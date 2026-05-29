#!/usr/bin/env node
/**
 * PatchPilot CLI — a thin, standalone scanner over @patchpilot/core.
 *
 *   patchpilot scan [path]     Scan a project folder for vulnerable deps (npm + PyPI)
 *   patchpilot --help
 *
 * It queries the live OSV database and tags each finding with the reachability
 * (VEX-lite) signal — so you fix what's actually imported first. Real results
 * only; with no network it simply reports no findings.
 */
import path from "node:path";
import { detectManifests } from "@patchpilot/core";
import { queryOsvFindings } from "@patchpilot/core";
import { collectFirstPartyImports, reachabilityForFinding } from "@patchpilot/core";

const C = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  orange: "\x1b[38;5;208m", red: "\x1b[31m", yellow: "\x1b[33m", green: "\x1b[32m", gray: "\x1b[90m"
};
const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const c = (code: string, s: string) => (useColor ? code + s + C.reset : s);

const REACH_LABEL: Record<string, string> = {
  imported: "reachable", not_imported: "likely unused", indirect: "transitive", unknown: "unknown"
};
const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, unknown: 0, "": 0 };
const SHORT_SEV: Record<string, string> = { critical: "CRIT", high: "HIGH", medium: "MED", low: "LOW", unknown: "—" };

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
  npx patchpilot-cli scan
  npx patchpilot-cli scan ./my-app --fail-on high
  patchpilot scan . --json > findings.json

Reachability: ${c(C.orange, "● reachable")} = imported in your source · ${c(C.gray, "○ likely unused / transitive")} = de-prioritized.
Queries the live OSV database; with no network it reports no findings.
`);
}

function sevColor(sev: string): string {
  if (sev === "critical" || sev === "high") return C.red;
  if (sev === "medium") return C.yellow;
  if (sev === "low") return C.gray;
  return C.gray;
}

/** Best-effort: fetch full OSV records to fill in severity the batch query omits. */
async function enrichSeverities(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(ids.filter(Boolean))];
  const limit = 8;
  let i = 0;
  async function worker(): Promise<void> {
    while (i < unique.length) {
      const id = unique[i++]!;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) continue;
        const body: any = await res.json();
        out.set(id, severityFromOsv(body));
      } catch { /* offline / rate-limited → leave unknown */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, unique.length) }, worker));
  return out;
}

function severityFromOsv(vuln: any): string {
  const cvss = (vuln?.severity ?? []).find((s: any) => String(s.type).toUpperCase().startsWith("CVSS"));
  const m = cvss?.score?.match(/^(\d+(\.\d+)?)/);
  if (m) return labelForCvss(Number(m[1]));
  const ds = vuln?.database_specific?.severity;
  if (typeof ds === "string") {
    const l = ds.toLowerCase();
    if (["critical", "high", "medium", "moderate", "low"].includes(l)) return l === "moderate" ? "medium" : l;
  }
  return "unknown";
}
function labelForCvss(s: number): string {
  if (s >= 9) return "critical"; if (s >= 7) return "high"; if (s >= 4) return "medium"; if (s > 0) return "low"; return "unknown";
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) { usage(); process.exit(0); }
  if (argv[0] !== "scan") { console.error(c(C.red, `Unknown command: ${argv[0]}`)); usage(); process.exit(2); }

  const json = argv.includes("--json");
  const failOnIdx = argv.indexOf("--fail-on");
  const failOn = failOnIdx >= 0 ? (argv[failOnIdx + 1] ?? "").toLowerCase() : "";
  const positional = argv.slice(1).filter((a) => !a.startsWith("--") && a !== failOn);
  const target = path.resolve(positional[0] ?? process.cwd());

  if (!json) {
    console.error("");
    console.error(c(C.dim, `  $ patchpilot scan ${positional[0] ?? "."}`));
    console.error(c(C.dim, `  Scanning ${target} via OSV…`));
  }

  const manifests = detectManifests(target);
  if (manifests.length === 0) {
    const msg = "No package.json or requirements.txt found. PatchPilot scans Node.js (npm) and Python (PyPI) projects.";
    if (json) console.log(JSON.stringify({ error: "unsupported_project", message: msg }, null, 2));
    else console.error(c(C.red, "  " + msg));
    process.exit(2);
  }

  const result = await queryOsvFindings(target, manifests);
  const imports = collectFirstPartyImports(target);

  let findings = result.findings.map((f) => {
    const reach = reachabilityForFinding(
      { packageName: f.packageName, ecosystem: f.ecosystem, dependencyType: f.dependencyType }, imports
    );
    const advisory = f.vulnerability.osvId ?? f.vulnerability.cveIds[0] ?? f.vulnerability.id;
    return {
      package: f.packageName, ecosystem: f.ecosystem, currentVersion: f.currentVersion,
      fixedVersion: f.fixedVersion ?? null,
      severity: (f.vulnerability.severity || "unknown").toLowerCase(),
      advisory, dependencyType: f.dependencyType,
      reachability: reach.status, reachabilityNote: reach.note
    };
  });

  // Fill missing severities from the OSV vuln records (batch query omits them).
  if (findings.some((f) => f.severity === "unknown" || !SEVERITY_RANK[f.severity])) {
    const enriched = await enrichSeverities(findings.map((f) => f.advisory));
    findings = findings.map((f) => (f.severity === "unknown" && enriched.has(f.advisory))
      ? { ...f, severity: enriched.get(f.advisory)! } : f);
  }

  // Reachable first, then by severity, then package name.
  findings.sort((a, b) => {
    const ra = a.reachability === "imported" ? 1 : 0, rb = b.reachability === "imported" ? 1 : 0;
    if (ra !== rb) return rb - ra;
    const sd = (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0);
    if (sd !== 0) return sd;
    return a.package.localeCompare(b.package);
  });

  if (json) {
    console.log(JSON.stringify({ target, scanner: result.scanner, count: findings.length, findings }, null, 2));
  } else {
    printReport(findings, result.scanner);
  }

  if (failOn && SEVERITY_RANK[failOn] !== undefined) {
    const breach = findings.some((f) => (SEVERITY_RANK[f.severity] ?? 0) >= SEVERITY_RANK[failOn]!);
    if (breach) process.exit(1);
  }
  process.exit(0);
}

function printReport(findings: Array<Record<string, any>>, scanner: string): void {
  if (findings.length === 0) {
    console.log("\n" + c(C.green, "  ✓ No known vulnerable dependencies found.") + c(C.dim, `  (scanner: ${scanner})\n`));
    return;
  }
  console.log("");
  console.log("  " + c(C.bold, `${findings.length} finding${findings.length === 1 ? "" : "s"}`) + c(C.dim, `  ·  scanner: ${scanner}`));
  console.log("");
  for (const f of findings) {
    const sev = (SHORT_SEV[f.severity] ?? "—").padEnd(4);
    const pkg = c(C.bold, f.package) + c(C.dim, `@${f.currentVersion}`);
    const fix = f.fixedVersion ? c(C.green, `→ ${f.fixedVersion}`) : c(C.dim, "manual review");
    console.log(`  ${c(sevColor(f.severity), sev)}  ${pkg}  ${fix}`);
    const dot = f.reachability === "imported" ? c(C.orange, "● reachable") : c(C.gray, `○ ${REACH_LABEL[f.reachability]}`);
    console.log(`        ${dot} ${c(C.dim, "· " + String(f.advisory))}`);
  }
  const reachable = findings.filter((f) => f.reachability === "imported").length;
  console.log("");
  console.log("  " + c(C.orange, "▸") + " " + c(C.bold, `${reachable} reachable`) + c(C.dim, ` · ${findings.length - reachable} de-prioritized`));
  console.log("  " + c(C.dim, "Fix the reachable ones first.") + "\n");
}

main().catch((err) => {
  console.error(c(C.red, "PatchPilot CLI error: ") + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
