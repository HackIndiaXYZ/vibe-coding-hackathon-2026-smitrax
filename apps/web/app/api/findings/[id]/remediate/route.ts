import { NextResponse } from "next/server";
import { JsonDatabase, PatchPilotService, apiError } from "@patchpilot/core";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: findingId } = await params;
    const body = await request.json().catch(() => ({})) as { agent?: "codex" | "openai" | "vercel-ai" | "manual" | "deterministic-npm" };
    const job = await new PatchPilotService(new JsonDatabase()).startRemediation(findingId, body.agent ?? "codex");
    return NextResponse.json({ remediationJobId: job.id, status: job.status, message: job.errorMessage ?? job.summary, patchPath: job.patchPath });
  } catch (error) {
    return NextResponse.json(apiError(error), { status: 400 });
  }
}
