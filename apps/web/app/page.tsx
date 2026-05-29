import { ArrowRight, ShieldCheck, GitPullRequest, Github } from "lucide-react";

const REPO = "https://github.com/MokiMeow/PatchPilot";

const PIPELINE = [
  ["01", "Inventory", "github + local"],
  ["02", "Scan", "OSV + scanners"],
  ["03", "Reachability", "only what's used"],
  ["04", "Risk", "EPSS + CISA KEV"],
  ["05", "Codex writes", "GPT-5.5, sandboxed"],
  ["06", "Validate", "build + tests pass"],
  ["07", "Attest", "signed proof"],
  ["08", "Approve", "phone tap, HMAC"],
  ["09", "Audit", "tamper-evident"]
] as const;

const FEATURES = [
  ["Reachability / VEX-lite", "Is the vulnerable package actually imported in your source? If not, it's de-prioritized. The CVE wall shrinks to the handful that matter."],
  ["Connect any model", "Codex (GPT-5.5) is the only model that writes to the repo. Behind it, configured cloud or local providers by policy, then a deterministic fallback. Secrets never reach the cloud."],
  ["Signed attestation", "Every fix ships a verifiable HMAC statement of from→to, validation result, and files changed — embedded in the PR."],
  ["Human-in-the-loop", "Inline Telegram buttons to approve, reject, retry safer, or rollback. No auto-merge, no auto-deploy, no exceptions."]
] as const;

const STACK = [
  "OpenAI Codex · GPT-5.5", "Ollama · local", "OpenRouter · any model",
  "OSV + OSV-Scanner", "Gitleaks", "Trivy", "Syft · SBOM",
  "EPSS", "CISA KEV", "MCP server", "Telegram · HMAC", "Postgres 16", "Redis · BullMQ"
];

export default function Landing() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <a className="lp-brand" href="/"><span className="lp-dot" />PatchPilot</a>
        <nav className="lp-nav-links">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
          <a className="lp-btn lp-btn-sm" href="/dashboard">Open dashboard <ArrowRight size={15} /></a>
        </nav>
      </header>

      {/* ===== Hero ===== */}
      <section className="lp-hero">
        <span className="lp-eyebrow">Watch Commander for supply-chain security</span>
        <h1 className="lp-h1">
          The model <em>plans</em> the fix.<br />
          A <span className="lp-accent">signed, human-approved</span> pipeline applies it.
        </h1>
        <p className="lp-lede">
          PatchPilot finds the CVEs that actually reach your code, lets OpenAI Codex write the fix
          inside a sandbox, signs the result, and waits for a tap on your phone. No auto-merge.
          No data leak. No faked integrations.
        </p>
        <div className="lp-cta">
          <a className="lp-btn" href="/dashboard">Open the dashboard <ArrowRight size={16} /></a>
          <a className="lp-btn lp-btn-ghost" href={REPO} target="_blank" rel="noreferrer"><Github size={16} /> View on GitHub</a>
        </div>
        <div className="lp-trust">
          <span><ShieldCheck size={14} /> No auto-merge / no auto-deploy</span>
          <span><GitPullRequest size={14} /> Signed provenance on every fix</span>
          <span className="lp-mono">npm + PyPI · 112 tests</span>
        </div>
      </section>

      {/* ===== How it works ===== */}
      <section className="lp-section" id="how">
        <span className="lp-section-label">How it works</span>
        <h2 className="lp-h2">Nine steps from a CVE to a signed, approved fix.</h2>
        <div className="lp-pipeline">
          {PIPELINE.map(([n, name, sub], i) => (
            <div className={`lp-step${[2, 4, 6].includes(i) ? " hot" : ""}`} key={n}>
              <span className="lp-step-n">{n}</span>
              <span className="lp-step-name">{name}</span>
              <span className="lp-step-sub">{sub}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Features ===== */}
      <section className="lp-section" id="features">
        <span className="lp-section-label">What makes it different</span>
        <h2 className="lp-h2">Triage what's reachable. Fix it safely. Prove it with a signature.</h2>
        <div className="lp-features">
          {FEATURES.map(([title, body], i) => (
            <div className="lp-feature" key={title}>
              <span className="lp-feature-n">0{i + 1}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Stack + CTA ===== */}
      <section className="lp-section lp-stack-section">
        <span className="lp-section-label">Built on real tools — no faked integrations</span>
        <div className="lp-stack">
          {STACK.map((s) => <span className="lp-chip" key={s}>{s}</span>)}
        </div>
        <div className="lp-final">
          <h2 className="lp-h2">Your repos and your AI agents. <span className="lp-accent">One command center.</span></h2>
          <div className="lp-cta">
            <a className="lp-btn" href="/dashboard">Open the dashboard <ArrowRight size={16} /></a>
            <a className="lp-btn lp-btn-ghost" href={REPO} target="_blank" rel="noreferrer"><Github size={16} /> Star on GitHub</a>
          </div>
        </div>
      </section>

      <footer className="lp-foot">
        <span className="lp-brand"><span className="lp-dot" />PatchPilot</span>
        <span className="lp-mono">Open-source · CVE &amp; supply-chain response · built with OpenAI Codex</span>
      </footer>
    </div>
  );
}
