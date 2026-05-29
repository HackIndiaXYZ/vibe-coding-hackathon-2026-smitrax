import { PatchPilotService, JsonDatabase } from "@patchpilot/core";

export default function ProjectsPage() {
  const projects = new PatchPilotService(new JsonDatabase()).listProjects();
  return (
    <>
      <div className="topline">Inventory</div>
      <h1>Projects</h1>
      <section className="panel" style={{ marginTop: 24 }}>
        <h2>Add Project</h2>
        <form className="form" action="/api/projects" method="post">
          <div className="field">
            <label>Source</label>
            <select name="sourceType" defaultValue="local">
              <option value="local">Local folder</option>
              <option value="github">GitHub repo</option>
            </select>
          </div>
          <div className="field"><label>Name</label><input name="name" placeholder="api-server" /></div>
          <div className="field"><label>Local path</label><input name="localPath" placeholder="C:\\projects\\api-server" /></div>
          <div className="field"><label>GitHub owner/repo</label><input name="github" placeholder="owner/repo" /></div>
          <button className="button" type="submit">Add</button>
        </form>
      </section>
      <section className="panel" style={{ marginTop: 14 }}>
        <h2>Watched Projects</h2>
        <table>
          <thead><tr><th>Name</th><th>Source</th><th>Package manager</th><th>Deployment</th><th>Last scan</th><th>Findings</th></tr></thead>
          <tbody>
            {projects.length === 0 ? <tr><td colSpan={6} className="muted">No projects watched yet. Add a GitHub repo or allowlisted local folder.</td></tr> : projects.map((project) => (
              <tr key={project.id}>
                <td>{project.name}</td>
                <td>{project.sourceType}</td>
                <td>{project.packageManager}</td>
                <td>{project.productionExposed ? "Production" : project.deploymentProvider}</td>
                <td>{project.lastScanStatus ?? "never"}</td>
                <td>{project.openFindings}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
