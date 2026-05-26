import { NextResponse } from "next/server";
import { JsonDatabase, PatchPilotService } from "@patchpilot/core";

export function GET() {
  return NextResponse.json({ blastRadius: new PatchPilotService(new JsonDatabase()).blastRadius() });
}
