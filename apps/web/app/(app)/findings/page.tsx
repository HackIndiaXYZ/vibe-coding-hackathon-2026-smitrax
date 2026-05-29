import { JsonDatabase } from "@patchpilot/core";

const REACH_LABEL: Record<string, { text: string; title: string }> = {
  imported: { text: "🎯 reachable", title: "Imported in first-party source — treat as reachable." },
  not_imported: { text: "💤 likely unused", title: "Not imported in first-party source — likely dev-only; de-prioritized (VEX-lite)." },
  indirect: { text: "🔗 transitive", title: "Reached via a parent dependency, not a first-party import." },
  unknown: { text: "❔ unknown", title: "Reachability could not be determined." }
};

export default function FindingsPage() {
  const state = new JsonDatabase().read();
  return (
    <>
      <div className="topline">Normalized vulnerability records</div>
      <h1>Findings</h1>
      <section className="panel" style={{ marginTop: 24 }}>
        <table>
          <thead><tr><th>Vulnerability</th><th>Project</th><th>Package</th><th>Risk</th><th>Reachability</th><th>Fix Strategy</th><th>Missing Data</th></tr></thead>
          <tbody>
            {state.findings.length === 0 ? <tr><td colSpan={7} className="muted">No findings from a real scan yet.</td></tr> : state.findings.map((finding) => {
              const vuln = state.vulnerabilities.find((v) => v.id === finding.vulnerabilityId);
              const project = state.projects.find((p) => p.id === finding.projectId);
              const reach = REACH_LABEL[finding.reachability ?? "unknown"]!;
              return <tr key={finding.id}><td>{vuln?.id}</td><td>{project?.name}</td><td>{finding.packageName}@{finding.currentVersion}</td><td className={finding.riskLevel}>{finding.riskScore} {finding.riskLevel}</td><td title={finding.reachabilityEvidence ?? reach.title}>{reach.text}</td><td>{finding.fixStrategy}</td><td>{finding.missingRiskData.join(", ") || "none"}</td></tr>;
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
