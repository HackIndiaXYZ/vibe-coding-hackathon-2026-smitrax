import { JsonDatabase, codexStatus } from "@patchpilot/core";

export default function RemediationsPage() {
  const state = new JsonDatabase().read();
  const codex = codexStatus();
  return (
    <>
      <div className="topline">Codex Remediation Timeline</div>
      <h1>Remediation Jobs</h1>
      <section className="panel" style={{ marginTop: 24 }}>
        <h2>Codex status</h2>
        <p className={codex.configured ? "ok" : "medium"}>{codex.message}</p>
      </section>
      <section className="panel" style={{ marginTop: 14 }}>
        <table>
          <thead><tr><th>Job</th><th>Agent</th><th>Status</th><th>Confidence</th><th>Patch</th><th>Rollback</th><th>Changed files</th><th>Error</th></tr></thead>
          <tbody>
            {state.remediationJobs.length === 0 ? <tr><td colSpan={8} className="muted">No remediation jobs yet. Jobs will not claim Codex ran unless the CLI really executed.</td></tr> : state.remediationJobs.map((job) => (
              <tr key={job.id}><td>{job.id}</td><td>{job.agent}</td><td>{job.status}</td><td>{job.fixConfidence ?? "unknown"}</td><td>{job.patchPath ?? "none"}</td><td>{job.rollbackStatus ?? "unknown"}</td><td>{job.changedFiles.join(", ")}</td><td>{job.errorMessage}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
