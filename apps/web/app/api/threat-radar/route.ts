import { NextResponse } from "next/server";
import { JsonDatabase, PatchPilotService } from "@patchpilot/core";

export function GET() {
  return NextResponse.json(new PatchPilotService(new JsonDatabase()).threatRadar());
}
