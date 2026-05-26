const baseUrl = (process.argv[2] ?? process.env.PATCHPILOT_SMOKE_BASE_URL ?? "").replace(/\/$/, "");

if (!baseUrl) {
  console.error("Usage: node scripts/smoke-app.mjs http://127.0.0.1:3000");
  process.exit(2);
}

const checks = [
  { path: "/", type: "html" },
  { path: "/api/health", type: "json", assert: (body) => body.ok === true && body.productionReady === false && body.queueMode === "inline" && body.services && Array.isArray(body.missingIntegrations) },
  { path: "/api/projects", type: "json" },
  { path: "/api/findings", type: "json" },
  { path: "/api/threat-radar", type: "json" },
  { path: "/api/blast-radius", type: "json" },
  { path: "/api/audit", type: "json" },
  { path: "/api/approvals", type: "json" }
];

const results = [];
for (const check of checks) {
  const started = Date.now();
  const response = await fetch(`${baseUrl}${check.path}`);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${check.path} returned ${response.status}: ${text.slice(0, 200)}`);
  }
  let body;
  if (check.type === "json") {
    body = JSON.parse(text);
    if (check.assert && !check.assert(body)) {
      throw new Error(`${check.path} returned a fake-ready or malformed payload`);
    }
  } else if (!text.includes("Watch Commander")) {
    throw new Error(`${check.path} did not render the dashboard`);
  }
  results.push({ path: check.path, status: response.status, bytes: text.length, ms: Date.now() - started });
}

console.log(JSON.stringify({ ok: true, baseUrl, results }, null, 2));
