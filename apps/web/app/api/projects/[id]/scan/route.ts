import { NextResponse } from "next/server";
import { JsonDatabase, PatchPilotService, apiError } from "@patchpilot/core";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const job = await new PatchPilotService(new JsonDatabase()).scanProject(id);
    return NextResponse.json({ scanJobId: job.id, status: job.status });
  } catch (error) {
    return NextResponse.json(apiError(error), { status: 400 });
  }
}
