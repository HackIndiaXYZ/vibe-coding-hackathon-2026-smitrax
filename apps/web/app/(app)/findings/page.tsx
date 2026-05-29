import { JsonDatabase } from "@patchpilot/core";

const REACH: Record<string, { text: string; cls: string; title: string }> = {
  imported: { text: "reachable", cls: "reach-hot", title: "Imported in first-party source — treat as reachable." },
  not_imported: { text: "likely unused", cls: "reach-dim", title: "Not imported in first-party source — likely dev-only; de-prioritized (VEX-lite)." },
  indirect: { text: "transitive", cls: "reach-muted", title: "Reached via a parent dependency, not a first-party import." },
  unknown: { text: "unknown", cls: "reach-muted", title: "Reachability could not be determined." }
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
            {state.findings.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-cell">
                  <strong>No findings from a real scan yet.</strong>
                  <span>Run a scan from the Projects page to populate findings. PatchPilot only shows results from real OSV / scanner runs — never seeded placeholders.</span>
                </td>
              </tr>
            ) : state.findings.map((finding) => {
              const vuln = state.vulnerabilities.find((v) => v.id === finding.vulnerabilityId);
              const project = state.projects.find((p) => p.id === finding.projectId);
              const reach = REACH[finding.reachability ?? "unknown"]!;
              return (
                <tr key={finding.id}>
                  <td className="mono">{vuln?.id}</td>
                  <td>{project?.name}</td>
                  <td className="mono">{finding.packageName}@{finding.currentVersion}</td>
                  <td className={finding.riskLevel}>{finding.riskScore} {finding.riskLevel}</td>
                  <td><span className={`reach ${reach.cls}`} title={finding.reachabilityEvidence ?? reach.title}>{reach.text}</span></td>
                  <td>{finding.fixStrategy}</td>
                  <td className="muted">{finding.missingRiskData.join(", ") || "none"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}
