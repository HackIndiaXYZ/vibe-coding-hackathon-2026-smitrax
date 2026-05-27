import { JsonDatabase } from "@patchpilot/core";

export default function ApprovalQueuePage() {
  const state = new JsonDatabase().read();
  const pendingApprovals = state.approvals.filter((approval) => approval.status === "pending");
  const pendingConsents = (state.providerConsents ?? []).filter((consent) => consent.status === "pending");
  const watchAlerts = (state.watchAlerts ?? []).slice(-15).reverse();

  return (
    <>
      <div className="topline">Everything waiting on you</div>
      <h1>Approval Queue</h1>
      <p className="muted" style={{ marginTop: 8, marginBottom: 24 }}>
        Remediation approvals, provider-failover consent requests, and watch-mode alerts. PatchPilot never auto-merges or auto-deploys — these are the human gates.
      </p>

      <section className="panel">
        <div className="section-label">Remediation approvals ({pendingApprovals.length} pending)</div>
        {pendingApprovals.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>No remediation approvals pending.</p>
        ) : (
          <table>
            <thead><tr><th>Approval</th><th>Job</th><th>Channel</th><th>Expires</th></tr></thead>
            <tbody>
              {pendingApprovals.map((approval) => (
                <tr key={approval.id}>
                  <td className="mono">{approval.id}</td>
                  <td className="mono">{approval.remediationJobId}</td>
                  <td>{approval.channel}</td>
                  <td className="muted">{approval.expiresAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel" style={{ marginTop: 24 }}>
        <div className="section-label">Provider failover consent ({pendingConsents.length} pending)</div>
        {pendingConsents.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>No provider-failover consent requests pending.</p>
        ) : (
          <table>
            <thead><tr><th>Failed provider</th><th>Candidate</th><th>Trust</th><th>Requested</th></tr></thead>
            <tbody>
              {pendingConsents.map((consent) => (
                <tr key={consent.id}>
                  <td>{consent.failedProvider}</td>
                  <td>{consent.candidateProvider}</td>
                  <td><span className="badge">{consent.candidateTrust}</span></td>
                  <td className="muted">{consent.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel" style={{ marginTop: 24 }}>
        <div className="section-label">Watch-mode alerts ({watchAlerts.length})</div>
        {watchAlerts.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>No watch alerts. Enable Watch Mode to monitor continuously.</p>
        ) : (
          <table>
            <thead><tr><th>Package</th><th>Advisory</th><th>Severity</th><th>Channel</th><th>When</th></tr></thead>
            <tbody>
              {watchAlerts.map((alert) => (
                <tr key={alert.id}>
                  <td className="mono">{alert.packageName}</td>
                  <td className="mono">{alert.advisoryId}</td>
                  <td className={alert.severity}>{alert.severity}</td>
                  <td>{alert.channel}</td>
                  <td className="muted">{alert.sentAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
