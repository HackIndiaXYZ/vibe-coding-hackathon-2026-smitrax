import { NextResponse } from "next/server";
import { agentProviderReadiness, integrationHealth, listAgentAdapters } from "@patchpilot/core";

export function GET() {
  const services = Object.fromEntries(integrationHealth().map((item) => [item.name, item.status]));
  const missingIntegrations = Object.entries(services)
    .filter(([, status]) => status !== "configured" && status !== "available")
    .map(([name, status]) => ({ name, status }));
  // agentProviderReadiness exposes env var NAMES only — never secret values.
  const agentProviders = agentProviderReadiness();
  return NextResponse.json({
    ok: true,
    productionReady: false,
    queueMode: "inline",
    version: "0.1.0",
    agents: listAgentAdapters(),
    agentProviders,
    selectedAgentProvider: agentProviders.find((provider) => provider.selected)?.id ?? "codex",
    services,
    missingIntegrations
  });
}
