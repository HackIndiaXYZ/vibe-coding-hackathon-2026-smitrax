import { JsonDatabase, PatchPilotService } from "@patchpilot/core";
import { PaginatedTable } from "../../../components/PaginatedTable";

export default function BlastRadiusPage() {
  const data = new PatchPilotService(new JsonDatabase()).blastRadius();
  const rows = [...data].reverse().map((row) => (
    <tr key={row.finding.id}>
      <td className="mono">{row.vulnerability?.id}</td>
      <td>{row.project?.name}</td>
      <td>{row.project?.sourceType}</td>
      <td>{row.directness}</td>
      <td>{row.fixAvailable ? row.finding.fixedVersion : "blocked"}</td>
      <td>{row.internetFacing ? "yes" : "unknown/no"}</td>
      <td>{row.codexJobStatus ?? "none"}</td>
      <td>{row.prUrl ? <a href={row.prUrl}>{row.prUrl}</a> : "none"}</td>
      <td>{row.validationPassed ? "passed" : "not passed"}</td>
    </tr>
  ));
  return (
    <>
      <div className="topline">Finding to project impact mapping</div>
      <h1>Blast Radius Map</h1>
      <section className="panel" style={{ marginTop: 24 }}>
        <PaginatedTable
          head={<tr><th>Advisory</th><th>Project</th><th>Source</th><th>Dependency</th><th>Fix</th><th>Exposed</th><th>Job</th><th>PR</th><th>Validation</th></tr>}
          rows={rows}
          pageSize={12}
          empty={<tr><td colSpan={9} className="muted">No blast radius exists until a real scan stores findings.</td></tr>}
        />
      </section>
    </>
  );
}
