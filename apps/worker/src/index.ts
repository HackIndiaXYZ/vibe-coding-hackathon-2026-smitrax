import { JsonDatabase, PatchPilotService, integrationHealth } from "@patchpilot/core";

const db = new JsonDatabase();
const service = new PatchPilotService(db);

console.log(JSON.stringify({
  service: "patchpilot-worker",
  mode: process.env.PATCHPILOT_QUEUE_MODE ?? "local",
  message: "Local worker mode is ready. API-triggered scans execute through the shared service; Redis/BullMQ can be enabled later without fake queue state.",
  integrations: integrationHealth()
}, null, 2));

if (process.argv.includes("--scan-all")) {
  const result = await service.scanAll();
  console.log(JSON.stringify(result, null, 2));
}
