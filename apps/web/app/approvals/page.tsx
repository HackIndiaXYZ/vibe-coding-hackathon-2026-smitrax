import { JsonDatabase } from "@patchpilot/core";

export default function ApprovalsPage() {
  const state = new JsonDatabase().read();
  return (
    <>
      <div className="topline">Phone Approval Gate</div>
      <h1>Approvals</h1>
      <section className="panel" style={{ marginTop: 24 }}>
        <table>
          <thead><tr><th>Approval ID</th><th>Job</th><th>Channel</th><th>Sent</th><th>Expires</th><th>Status</th></tr></thead>
          <tbody>
            {state.approvals.length === 0 ? <tr><td colSpan={6} className="muted">No approval requests. Telegram remains unavailable until configured.</td></tr> : state.approvals.map((approval) => (
              <tr key={approval.id}><td>{approval.id}</td><td>{approval.remediationJobId}</td><td>{approval.channel}</td><td>{approval.createdAt}</td><td>{approval.expiresAt}</td><td>{approval.status}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
