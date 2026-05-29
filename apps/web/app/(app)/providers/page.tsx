import { JsonDatabase, agentProviderReadiness, getSettings } from "@patchpilot/core";
import { SettingsControls } from "../../../components/SettingsControls";

const PROVIDER_ACTIONS = new Set([
  "provider_chain_started", "provider_readiness_checked", "provider_attempt_started",
  "provider_attempt_failed", "provider_attempt_completed", "provider_failover_consent_requested",
  "provider_failover_consent_approved", "provider_failover_consent_rejected",
  "local_model_used", "deterministic_fallback_used"
]);

export default function ProvidersPage() {
  const db = new JsonDatabase();
  const state = db.read();
  const failover = getSettings(db).failover;
  const providers = agentProviderReadiness();
  const consents = (state.providerConsents ?? []).slice(-8).reverse();
  const timeline = state.auditReceipts.filter((receipt) => PROVIDER_ACTIONS.has(receipt.action)).slice(-12).reverse();

  return (
    <>
      <div className="topline">Provider ladder &amp; failover</div>
      <h1>Providers</h1>
      <p className="muted" style={{ marginTop: 8, marginBottom: 24 }}>
        Chain: <span className="mono">{failover.chain.join(" → ")}</span>. Only Codex edits the repo; cloud/local providers return strict JSON plans PatchPilot applies. Lower-trust providers need consent in <b>ask</b> mode. No API keys are ever shown here.
      </p>

      <section className="grid two">
        <div className="panel">
          <div className="section-label">Provider readiness</div>
          <table>
            <thead><tr><th>Provider</th><th>Status</th><th>Edits repo</th><th>Required env</th></tr></thead>
            <tbody>
              {providers.map((provider) => (
                <tr key={provider.id}>
                  <td>{provider.label}{provider.selected ? " ★" : ""}</td>
                  <td><span className={`status-badge ${provider.status}`}>{provider.status}</span></td>
                  <td>{provider.modelEditsRepo ? "yes" : "no"}</td>
                  <td className="mono">{provider.requiredEnv.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <div className="section-label">Failover controls</div>
          <SettingsControls section="failover" initial={{ mode: failover.mode, allowCloudFailover: failover.allowCloudFailover, allowLocalFailover: failover.allowLocalFailover, requireConsentForLowerTrust: failover.requireConsentForLowerTrust }} />
        </div>
      </section>

      <section className="panel" style={{ marginTop: 24 }}>
        <div className="section-label">Failover consent requests</div>
        {consents.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>No failover consent requests yet.</p>
        ) : (
          <table>
            <thead><tr><th>Failed</th><th>Candidate</th><th>Trust</th><th>Status</th><th>When</th></tr></thead>
            <tbody>
              {consents.map((consent) => (
                <tr key={consent.id}>
                  <td>{consent.failedProvider}</td>
                  <td>{consent.candidateProvider}</td>
                  <td>{consent.candidateTrust}</td>
                  <td><span className={`status-badge ${consent.status === "resolved" || consent.status === "approved" ? "completed" : consent.status === "pending" ? "not_applicable" : "failed"}`}>{consent.status}</span></td>
                  <td className="muted">{consent.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel" style={{ marginTop: 24 }}>
        <div className="section-label">Failover timeline</div>
        {timeline.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>No provider failover activity recorded yet.</p>
        ) : (
          <div className="timeline">
            {timeline.map((receipt) => (
              <div key={receipt.id}>
                <span className="mono">{receipt.action}</span> {receipt.agent ? `· ${receipt.agent}` : ""}
                <br />
                <span className="muted">{receipt.createdAt}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
