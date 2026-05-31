import { JsonDatabase } from "@patchpilot/core";
import { PaginatedTable } from "../../../components/PaginatedTable";

export default function AuditPage() {
  const receipts = new JsonDatabase().read().auditReceipts.slice().reverse();
  const rows = receipts.map((receipt) => (
    <tr key={receipt.id}><td className="mono">{receipt.id}</td><td>{receipt.action}</td><td>{receipt.actorType}</td><td>{receipt.targetType}:{receipt.targetId}</td><td className="mono">{receipt.receiptHash.slice(0, 16)}</td><td className="mono">{receipt.previousReceiptHash?.slice(0, 16) ?? "genesis"}</td></tr>
  ));
  return (
    <>
      <div className="topline">Tamper-evident receipt hash chain</div>
      <h1>Audit Receipts</h1>
      <section className="panel" style={{ marginTop: 24 }}>
        <PaginatedTable
          head={<tr><th>Receipt</th><th>Action</th><th>Actor</th><th>Target</th><th>Hash</th><th>Previous</th></tr>}
          rows={rows}
          pageSize={12}
          empty={<tr><td colSpan={6} className="muted">No audit receipts yet.</td></tr>}
        />
      </section>
    </>
  );
}
