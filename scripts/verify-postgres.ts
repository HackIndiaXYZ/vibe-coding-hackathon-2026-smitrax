import { emptyState, loadStateFromPostgres, postgresStatus, saveStateToPostgres } from "../packages/core/src/index.ts";
import { loadDotenvFile, safeJson } from "./live-utils.ts";

loadDotenvFile();
// Default to the docker-compose container if not already configured.
process.env.PATCHPILOT_PERSIST_POSTGRES ||= "true";
process.env.DATABASE_URL ||= "postgresql://patchpilot:patchpilot@localhost:5432/patchpilot";

// Round-trips a state document through Postgres to prove durable persistence.
async function main() {
  const marker = `proj_pgtest_${Date.now()}`;
  const sample = { ...emptyState(), projects: [{ id: marker, name: "pg-roundtrip", sourceType: "local", isPathAllowlisted: true, packageManager: "npm", deploymentProvider: "none", productionExposed: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] } as ReturnType<typeof emptyState>;
  await saveStateToPostgres(sample);
  const loaded = await loadStateFromPostgres();
  const status = await postgresStatus();
  const ok = status.ok && loaded?.projects?.[0]?.id === marker;
  console.log(safeJson({ ok, status, roundTrip: loaded?.projects?.[0]?.id === marker, projectsInPostgres: loaded?.projects?.length ?? 0 }));
  if (!ok) process.exit(1);
  process.exit(0);
}

main().catch((error) => {
  console.error(safeJson({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
