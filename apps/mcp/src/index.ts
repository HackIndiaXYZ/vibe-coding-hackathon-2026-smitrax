import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { JsonDatabase, PatchPilotService, createAuditReceipt } from "@patchpilot/core";

const db = new JsonDatabase();
const service = new PatchPilotService(db);
const server = new McpServer({ name: "patchpilot", version: "0.1.0" });

server.tool("patchpilot.list_projects", {}, async () => ({
  content: [{ type: "text", text: JSON.stringify(service.listProjects(), null, 2) }]
}));

server.tool("patchpilot.scan_project", { projectId: z.string() }, async ({ projectId }) => ({
  content: [{ type: "text", text: JSON.stringify(await service.scanProject(projectId), null, 2) }]
}));

server.tool("patchpilot.scan_all", {}, async () => ({
  content: [{ type: "text", text: JSON.stringify(await service.scanAll(), null, 2) }]
}));

server.tool("patchpilot.get_threat_radar", {}, async () => ({
  content: [{ type: "text", text: JSON.stringify(service.threatRadar(), null, 2) }]
}));

server.tool("patchpilot.get_blast_radius", {}, async () => ({
  content: [{ type: "text", text: JSON.stringify(service.blastRadius(), null, 2) }]
}));

server.tool("patchpilot.get_vulnerability", { vulnerabilityId: z.string() }, async ({ vulnerabilityId }) => {
  const state = db.read();
  return { content: [{ type: "text", text: JSON.stringify(state.vulnerabilities.find((item) => item.id === vulnerabilityId) ?? null, null, 2) }] };
});

server.tool("patchpilot.create_patch_job", { findingId: z.string(), agent: z.enum(["manual", "deterministic-npm"]).optional() }, async ({ findingId, agent }) => {
  const job = await service.startRemediation(findingId, agent ?? "manual");
  return { content: [{ type: "text", text: JSON.stringify(job, null, 2) }] };
});

server.tool("patchpilot.get_job_status", { jobId: z.string() }, async ({ jobId }) => {
  const state = db.read();
  return { content: [{ type: "text", text: JSON.stringify(state.remediationJobs.find((item) => item.id === jobId) ?? null, null, 2) }] };
});

server.tool("patchpilot.run_validation", { remediationJobId: z.string() }, async ({ remediationJobId }) => ({
  content: [{ type: "text", text: `Validation must run against a concrete workspace through the worker. Job: ${remediationJobId}` }]
}));

server.tool("patchpilot.create_pr", { remediationJobId: z.string() }, async ({ remediationJobId }) => ({
  content: [{ type: "text", text: `GitHub PR creation requires GITHUB_TOKEN and a pushed branch. PatchPilot will not fabricate a PR for ${remediationJobId}.` }]
}));

server.tool("patchpilot.send_approval_request", { remediationJobId: z.string() }, async ({ remediationJobId }) => ({
  content: [{ type: "text", text: `Telegram approval requires TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_CHAT_IDS, and APPROVAL_HMAC_SECRET. Job: ${remediationJobId}` }]
}));

server.tool("patchpilot.record_audit_receipt", { action: z.string(), targetType: z.string(), targetId: z.string() }, async ({ action, targetType, targetId }) => ({
  content: [{ type: "text", text: JSON.stringify(createAuditReceipt(db, { actorType: "mcp", action, targetType, targetId }), null, 2) }]
}));

server.tool("patchpilot.get_audit_receipts", {}, async () => ({
  content: [{ type: "text", text: JSON.stringify(db.read().auditReceipts, null, 2) }]
}));

server.tool("patchpilot.rollback", { remediationJobId: z.string() }, async ({ remediationJobId }) => ({
  content: [{ type: "text", text: JSON.stringify(await service.rollback(remediationJobId), null, 2) }]
}));

await server.connect(new StdioServerTransport());
