import { NextResponse } from "next/server";
import { JsonDatabase, PatchPilotService } from "@patchpilot/core";

export async function POST() {
  const result = await new PatchPilotService(new JsonDatabase()).scanAll();
  return NextResponse.json(result);
}
