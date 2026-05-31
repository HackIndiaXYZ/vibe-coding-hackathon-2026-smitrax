import { JsonDatabase } from "@patchpilot/core";
import { PaginatedTable } from "../../../components/PaginatedTable";

export default function ApprovalsPage() {
  const state = new JsonDatabase().read();
  const rows = [...state.approvals].reverse().map((approval) => (
    <tr key={approval.id}><td className="mono">{approval.id}</td><td className="mono">{approval.remediationJobId}</td><td>{approval.channel}</td><td>{approval.createdAt}</td><td>{approval.expiresAt}</td><td>{approval.status}</td></tr>
  ));
  return (
    <>
      <div className="topline">Phone Approval Gate</div>
      <h1>Approvals</h1>
      <section className="panel" style={{ marginTop: 24 }}>
        <PaginatedTable
          head={<tr><th>Approval ID</th><th>Job</th><th>Channel</th><th>Sent</th><th>Expires</th><th>Status</th></tr>}
          rows={rows}
          pageSize={12}
          empty={<tr><td colSpan={6} className="muted">No approval requests. Telegram remains unavailable until configured.</td></tr>}
        />
      </section>
    </>
  );
}
