import { NextResponse } from "next/server";
import { JsonDatabase } from "@patchpilot/core";

export function GET() {
  return NextResponse.json({ approvals: new JsonDatabase().read().approvals });
}
