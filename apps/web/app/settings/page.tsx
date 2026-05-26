import { agentProviderReadiness, integrationHealth, listAgentAdapters } from "@patchpilot/core";

export default function SettingsPage() {
  const providers = agentProviderReadiness();
  const selected = providers.find((provider) => provider.selected)?.id ?? "codex";
  return (
    <>
      <div className="topline">Configuration-gated integrations</div>
      <h1>Settings</h1>
      <section className="panel" style={{ marginTop: 24 }}>
        <h2>Model Providers (BYO)</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Selected provider: <span className="badge">{selected}</span>. Only Codex edits the repo directly; OpenRouter, OpenAI-compatible, and Ollama return strict JSON plans that PatchPilot applies itself. Required env shows names only — never secret values.
        </p>
        <table>
          <thead><tr><th>Provider</th><th>Status</th><th>Applies via</th><th>Model edits repo</th><th>Required env</th></tr></thead>
          <tbody>
            {providers.map((provider) => (
              <tr key={provider.id}>
                <td>{provider.label}{provider.selected ? " ★" : ""}</td>
                <td className={provider.status === "configured" ? "ok" : provider.status === "unavailable" ? "high" : "medium"}>{provider.status}</td>
                <td>{provider.applyStrategy}</td>
                <td>{provider.modelEditsRepo ? "yes" : "no"}</td>
                <td className="mono">{provider.requiredEnv.join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel" style={{ marginTop: 24 }}>
        <table>
          <thead><tr><th>Integration</th><th>Status</th><th>Message</th><th>Required env</th></tr></thead>
          <tbody>
            {integrationHealth().map((item) => (
              <tr key={item.name}><td>{item.name}</td><td className={item.status === "available" || item.status === "configured" ? "ok" : "medium"}>{item.status}</td><td>{item.message}</td><td>{item.requiredEnv?.join(", ") ?? ""}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel" style={{ marginTop: 14 }}>
        <h2>Agent Adapters</h2>
        <table>
          <thead><tr><th>Adapter</th><th>Status</th><th>Workspace edits</th><th>Message</th></tr></thead>
          <tbody>
            {listAgentAdapters().map((item) => (
              <tr key={item.id}>
                <td>{item.label}</td>
                <td className={item.status === "configured" ? "ok" : "medium"}>{item.status}</td>
                <td>{item.canModifyWorkspace ? "yes" : "plan only"}</td>
                <td>{item.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
