import { JsonDatabase, PatchPilotService, integrationHealth } from "@patchpilot/core";

export default function Dashboard() {
  const db = new JsonDatabase();
  const state = db.read();
  const service = new PatchPilotService(db);
  const radar = service.threatRadar();
  const projects = service.listProjects();
  const health = integrationHealth();
  const metrics = [
    ["Projects watched", projects.length, "Stored inventory records"],
    ["GitHub repos", projects.filter((p) => p.sourceType === "github").length, "Validated only with token"],
    ["Local folders", projects.filter((p) => p.sourceType === "local" || p.sourceType === "vercel-linked").length, "Allowlisted roots only"],
    ["Vercel/deployments", projects.filter((p) => p.deploymentProvider !== "none").length, "Mapped, not faked"],
    ["Relevant advisories", radar.relevantAdvisories, "From persisted findings"],
    ["Affected projects", radar.affectedProjects, "Open findings"],
    ["Critical/high risks", radar.criticalHighRisks, "Risk engine output"],
    ["Approvals pending", radar.approvalsPending, "Signed approval queue"]
  ];
  const findings = state.findings.slice(-8).reverse();
  return (
    <>
      <div className="topline">Cross-project CVE and supply-chain response</div>
      <h1>Watch Commander</h1>
      <section className="grid metrics">
        {metrics.map(([label, value, foot]) => (
          <div className="card" key={label}>
            <div className="metric-label">{label}</div>
            <div className="metric-value">{value}</div>
            <div className="metric-foot">{foot}</div>
          </div>
        ))}
      </section>

      <section className="grid two">
        <div className="panel">
          <h2>Threat Radar</h2>
          <div className="radar">
            <RadarBox label="Advisories scanned" value={radar.advisoriesScanned} />
            <RadarBox label="Actively exploited" value={radar.activelyExploited} tone="critical" />
            <RadarBox label="Fixes available" value={radar.fixesAvailable} tone="ok" />
            <RadarBox label="Fixes blocked" value={radar.fixesBlocked} tone="medium" />
            <RadarBox label="Jobs running" value={radar.jobsRunning} />
            <RadarBox label="Package alerts" value={radar.maliciousPackageAlerts} tone="medium" />
          </div>
        </div>
        <div className="panel">
          <h2>Integration Health</h2>
          <div className="timeline">
            {health.map((item) => (
              <div key={item.name}>
                <span className={item.status === "available" || item.status === "configured" ? "ok" : "medium"}>{item.name}</span>
                <br />
                {item.message}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 14 }}>
        <h2>Affected Projects</h2>
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Source</th>
              <th>Deployment</th>
              <th>Risk</th>
              <th>Package</th>
              <th>Fix</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {findings.length === 0 ? (
              <tr><td colSpan={7} className="muted">No open findings from a successful real scan yet.</td></tr>
            ) : findings.map((finding) => {
              const project = state.projects.find((p) => p.id === finding.projectId);
              return (
                <tr key={finding.id}>
                  <td>{project?.name ?? "Unknown"}</td>
                  <td>{project?.sourceType ?? "unknown"}</td>
                  <td>{project?.productionExposed ? "Production exposed" : project?.deploymentUrl ?? "Not deployed"}</td>
                  <td className={finding.riskLevel}>{finding.riskScore}/100 {finding.riskLevel}</td>
                  <td>{finding.packageName}@{finding.currentVersion}</td>
                  <td>{finding.fixedVersion ? `Update to ${finding.fixedVersion}` : "Manual review"}</td>
                  <td>{finding.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </>
  );
}

function RadarBox({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return <div className="radar-item"><div className="metric-label">{label}</div><div className={`metric-value ${tone ?? ""}`}>{value}</div></div>;
}
