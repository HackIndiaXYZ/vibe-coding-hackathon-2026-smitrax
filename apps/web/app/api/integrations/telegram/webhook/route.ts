import { NextRequest, NextResponse } from "next/server";
import {
  FAILOVER_CONSENT_OPTIONS,
  JsonDatabase,
  PatchPilotError,
  PatchPilotService,
  answerTelegramCallback,
  apiError,
  applyPatch,
  chatAllowed,
  createAuditReceipt,
  editTelegramMessageText,
  getEnv,
  now,
  parseTelegramCallback,
  validateTelegramWebhookSecret,
  verifyApprovalToken
} from "@patchpilot/core";

type Action = "approve" | "reject" | (typeof FAILOVER_CONSENT_OPTIONS)[number] | "start" | "dismiss";

// Applies a remediation approve/reject decision by approval id. Returns the new status.
function applyApprovalDecision(db: JsonDatabase, approvalId: string, action: "approve" | "reject", chatId: number | string): string {
  let status = "not_found";
  db.update((state) => {
    const approval = state.approvals.find((item) => item.id === approvalId);
    if (!approval) return;
    if (approval.status !== "pending") { status = approval.status; return; }
    if (new Date(approval.expiresAt).getTime() < Date.now()) { approval.status = "expired"; approval.updatedAt = now(); status = "expired"; return; }
    approval.status = action === "approve" ? "approved" : "rejected";
    approval.updatedAt = now();
    status = approval.status;
    const job = state.remediationJobs.find((item) => item.id === approval.remediationJobId);
    if (job) job.status = approval.status === "approved" ? "approved" : "rejected";
  });
  if (status === "approved" && getEnv("PATCHPILOT_APPLY_LOCAL_PATCH_ON_APPROVAL") === "true") {
    const state = db.read();
    const approval = state.approvals.find((item) => item.id === approvalId);
    const job = approval ? state.remediationJobs.find((item) => item.id === approval.remediationJobId) : undefined;
    const project = job ? state.projects.find((item) => item.id === job.projectId) : undefined;
    if (job?.patchPath && project?.localPath && !job.patchAppliedAt) {
      applyPatch(project.localPath, job.patchPath);
      db.update((draft) => {
        const stored = draft.remediationJobs.find((item) => item.id === job.id);
        if (stored) { stored.patchAppliedAt = now(); stored.rollbackStatus = "available"; }
      });
    }
  }
  createAuditReceipt(db, { actorType: "user", actorId: String(chatId), channel: "telegram", action: `approval.${status}`, targetType: "approval_request", targetId: approvalId, approvalChannel: "telegram", outputSummary: { action, status } });
  return status;
}

export async function POST(request: NextRequest) {
  try {
    validateTelegramWebhookSecret(request.headers.get("X-Telegram-Bot-Api-Secret-Token"));
    const update = await request.json() as {
      callback_query?: { id?: string; data?: string; from?: { id: number }; message?: { message_id?: number; chat?: { id: number } } };
    };
    const callback = update.callback_query;
    const chatId = callback?.message?.chat?.id ?? callback?.from?.id;
    if (!callback?.data || !chatId) return NextResponse.json({ ok: true, ignored: true });
    if (!chatAllowed(chatId)) {
      return NextResponse.json({ error: { code: "telegram_chat_unauthorized", message: "This Telegram chat is not allowed to approve PatchPilot actions.", details: {} } }, { status: 403 });
    }

    const db = new JsonDatabase();
    const service = new PatchPilotService(db);
    let toast = "";
    let edited = "";

    // Preferred path: short inline-button payloads (kind:id:action). The Telegram
    // secret header + chat allowlist authenticate the request (no token to copy).
    const tap = parseTelegramCallback(callback.data);
    if (tap) {
      if (tap.kind === "a" && (tap.action === "approve" || tap.action === "reject")) {
        const status = applyApprovalDecision(db, tap.id, tap.action, chatId);
        toast = status === "approved" ? "Approved ✅" : status === "rejected" ? "Rejected ❌" : `Already ${status}`;
        edited = `PatchPilot remediation: ${toast}`;
      } else if (tap.kind === "c" && (FAILOVER_CONSENT_OPTIONS as readonly string[]).includes(tap.action)) {
        const result = await service.resolveProviderConsent(tap.id, tap.action as (typeof FAILOVER_CONSENT_OPTIONS)[number], String(chatId));
        toast = tap.action === "reject" ? "Failover rejected ❌" : `Provider consent: ${result.status}`;
        edited = `PatchPilot provider failover: ${toast}`;
      } else if (tap.kind === "w" && tap.action === "start") {
        const result = await service.startGuardedRemediation(tap.id);
        toast = `Remediation started (${result.outcome})`;
        edited = `PatchPilot watch: ${toast}`;
        createAuditReceipt(db, { actorType: "user", actorId: String(chatId), channel: "telegram", action: "watch.remediation_requested", targetType: "finding", targetId: tap.id, outputSummary: { outcome: result.outcome } });
      } else if (tap.kind === "w" && tap.action === "dismiss") {
        toast = "Dismissed 🔕";
        edited = "PatchPilot watch: dismissed";
        createAuditReceipt(db, { actorType: "user", actorId: String(chatId), channel: "telegram", action: "watch.dismissed", targetType: "finding", targetId: tap.id, outputSummary: {} });
      } else {
        toast = "Unknown action";
      }
    } else {
      // Legacy path: long signed token in callback_data (back-compat).
      const payload = verifyApprovalToken(callback.data);
      const consent = db.read().providerConsents?.find((item) => item.id === payload.approvalId);
      if (consent && (FAILOVER_CONSENT_OPTIONS as readonly string[]).includes(payload.action)) {
        const result = await service.resolveProviderConsent(consent.id, payload.action as (typeof FAILOVER_CONSENT_OPTIONS)[number], String(chatId));
        toast = `Provider consent: ${result.status}`;
      } else if (payload.action === "approve" || payload.action === "reject") {
        const status = applyApprovalDecision(db, payload.approvalId, payload.action, chatId);
        toast = `Remediation ${status}`;
      } else {
        toast = "Unsupported token action";
      }
    }

    // Instant feedback: stop the spinner, show a toast, and replace the message
    // text (which also removes the now-stale buttons).
    if (callback.id) await answerTelegramCallback(callback.id, toast);
    if (edited && callback.message?.message_id) await editTelegramMessageText(chatId, callback.message.message_id, edited);

    return NextResponse.json({ ok: true, result: toast });
  } catch (error) {
    return NextResponse.json(apiError(error), { status: error instanceof PatchPilotError ? error.status : 400 });
  }
}
