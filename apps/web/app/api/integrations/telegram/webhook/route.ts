import { NextRequest, NextResponse } from "next/server";
import { JsonDatabase, PatchPilotError, apiError, applyPatch, chatAllowed, createAuditReceipt, getEnv, now, validateTelegramWebhookSecret, verifyApprovalToken } from "@patchpilot/core";

export async function POST(request: NextRequest) {
  try {
    validateTelegramWebhookSecret(request.headers.get("X-Telegram-Bot-Api-Secret-Token"));
    const update = await request.json() as {
      callback_query?: {
        data?: string;
        from?: { id: number };
        message?: { chat?: { id: number } };
      };
    };
    const callback = update.callback_query;
    const chatId = callback?.message?.chat?.id ?? callback?.from?.id;
    if (!callback?.data || !chatId) {
      return NextResponse.json({ ok: true, ignored: true });
    }
    if (!chatAllowed(chatId)) {
      return NextResponse.json({ error: { code: "telegram_chat_unauthorized", message: "This Telegram chat is not allowed to approve PatchPilot actions.", details: {} } }, { status: 403 });
    }
    const payload = verifyApprovalToken(callback.data);
    const db = new JsonDatabase();
    let status = "pending";
    db.update((state) => {
      const approval = state.approvals.find((item) => item.id === payload.approvalId);
      if (!approval) return;
      if (approval.status !== "pending") return;
      approval.status = payload.action === "approve" ? "approved" : payload.action === "reject" ? "rejected" : approval.status;
      approval.updatedAt = now();
      status = approval.status;
      const job = state.remediationJobs.find((item) => item.id === approval.remediationJobId);
      if (job && approval.status === "approved") job.status = "approved";
      if (job && approval.status === "rejected") job.status = "rejected";
    });
    if (status === "approved" && getEnv("PATCHPILOT_APPLY_LOCAL_PATCH_ON_APPROVAL") === "true") {
      const state = db.read();
      const approval = state.approvals.find((item) => item.id === payload.approvalId);
      const job = approval ? state.remediationJobs.find((item) => item.id === approval.remediationJobId) : undefined;
      const project = job ? state.projects.find((item) => item.id === job.projectId) : undefined;
      if (job?.patchPath && project?.localPath && !job.patchAppliedAt) {
        applyPatch(project.localPath, job.patchPath);
        db.update((draft) => {
          const stored = draft.remediationJobs.find((item) => item.id === job.id);
          if (stored) {
            stored.patchAppliedAt = now();
            stored.rollbackStatus = "available";
          }
        });
      }
    }
    createAuditReceipt(db, {
      actorType: "user",
      actorId: String(chatId),
      channel: "telegram",
      action: `approval.${status}`,
      targetType: "approval_request",
      targetId: payload.approvalId,
      approvalChannel: "telegram",
      outputSummary: { action: payload.action, status }
    });
    return NextResponse.json({ ok: true, status });
  } catch (error) {
    return NextResponse.json(apiError(error), { status: error instanceof PatchPilotError ? error.status : 400 });
  }
}
