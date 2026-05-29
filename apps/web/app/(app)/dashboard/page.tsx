import { JsonDatabase, PatchPilotService, agentProviderReadiness, integrationHealth } from "@patchpilot/core";

export default function Dashboard() {
  const db = new JsonDatabase();
  const state = db.read();
  const service = new PatchPilotService(db);
  const radar = service.threatRadar();
  const health = integrationHealth();
  const providers = agentProviderReadiness();
  const selectedProvider = providers.find((provider) => provider.selected) ?? providers[0];

  const openFindings = state.findings.filter((finding) => finding.status !== "resolved").length;
  const ready = health.filter((item) => item.status === "configured" || item.status === "available");
  const notReady = health.filter((item) => item.status !== "configured" && item.status !== "available");

  const kpis: Array<{ label: string; value: number; foot: string; tone?: string }> = [
    { label: "Open findings", value: openFindings, foot: "From real scans" },
    { label: "Critical / high", value: radar.criticalHighRisks, foot: "Risk engine output", tone: radar.criticalHighRisks > 0 ? "critical" : "ok" },
    { label: "Fixes available", value: radar.fixesAvailable, foot: "Safe upgrade known", tone: "ok" },
    { label: "Approvals pending", value: radar.approvalsPending, foot: "Signed queue", tone: radar.approvalsPending > 0 ? "medium" : undefined }
  ];

  const signals: Array<{ label: string; value: number; tone?: string }> = [
    { label: "Actively exploited (KEV)", value: radar.activelyExploited, tone: radar.activelyExploited > 0 ? "critical" : undefined },
    { label: "Malicious package alerts", value: radar.maliciousPackageAlerts, tone: radar.maliciousPackageAlerts > 0 ? "medium" : undefined },
    { label: "Fixes blocked", value: radar.fixesBlocked },
    { label: "Remediation jobs running", value: radar.jobsRunning },
    { label: "Advisories scanned", value: radar.advisoriesScanned }
  ];

  const findings = state.findings.slice(-8).reverse();

  return (
    <>
      <div className="page-head">
        <div className="topline">Cross-project CVE &amp; supply-chain response</div>
        <div className="head-row">
          <h1>Watch Commander</h1>
          <span className="badge">remediation: {selectedProvider?.id ?? "codex"}</span>
        </div>
      </div>

      <section className="grid metrics">
        {kpis.map((kpi) => (
          <div className="card" key={kpi.label}>
            <div className="metric-label">{kpi.label}</div>
            <div className={`metric-value ${kpi.tone ?? ""}`}>{kpi.value}</div>
            <div className="metric-foot">{kpi.foot}</div>
          </div>
        ))}
      </section>

      <section className="grid two">
        <div className="panel">
          <div className="section-label">Affected projects</div>
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Risk</th>
                <th>Package</th>
                <th>Fix</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {findings.length === 0 ? (
                <tr><td colSpan={5} className="muted">No open findings from a successful real scan yet.</td></tr>
              ) : findings.map((finding) => {
                const project = state.projects.find((item) => item.id === finding.projectId);
                return (
                  <tr key={finding.id}>
                    <td>{project?.name ?? "Unknown"}</td>
                    <td className={finding.riskLevel}>{finding.riskScore}/100</td>
                    <td className="mono">{finding.packageName}@{finding.currentVersion}</td>
                    <td>{finding.fixedVersion ? `→ ${finding.fixedVersion}` : "manual review"}</td>
                    <td>{finding.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="section-label">Posture</div>
          <ul className="statlist">
            {signals.map((signal) => (
              <li className="stat" key={signal.label}>
                <span>{signal.label}</span>
                <b className={signal.value > 0 ? signal.tone ?? "" : "muted"}>{signal.value}</b>
              </li>
            ))}
          </ul>

          <div className="section-label" style={{ marginTop: 24 }}>
            Integrations · {ready.length}/{health.length} ready
          </div>
          {notReady.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>All integrations configured.</p>
          ) : (
            <div className="chips">
              {notReady.map((item) => (
                <span className="chip" key={item.name} title={item.message}>
                  <span className={`dot ${item.status === "unavailable" ? "bad" : "warn"}`} />
                  {item.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
