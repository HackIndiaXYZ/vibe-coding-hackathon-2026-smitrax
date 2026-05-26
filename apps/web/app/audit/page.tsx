import { JsonDatabase } from "@patchpilot/core";

export default function AuditPage() {
  const receipts = new JsonDatabase().read().auditReceipts.slice().reverse();
  return (
    <>
      <div className="topline">Tamper-evident receipt hash chain</div>
      <h1>Audit Receipts</h1>
      <section className="panel" style={{ marginTop: 24 }}>
        <table>
          <thead><tr><th>Receipt</th><th>Action</th><th>Actor</th><th>Target</th><th>Hash</th><th>Previous</th></tr></thead>
          <tbody>
            {receipts.length === 0 ? <tr><td colSpan={6} className="muted">No audit receipts yet.</td></tr> : receipts.map((receipt) => (
              <tr key={receipt.id}><td>{receipt.id}</td><td>{receipt.action}</td><td>{receipt.actorType}</td><td>{receipt.targetType}:{receipt.targetId}</td><td>{receipt.receiptHash.slice(0, 16)}</td><td>{receipt.previousReceiptHash?.slice(0, 16) ?? "genesis"}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
