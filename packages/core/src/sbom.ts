import { spawnSync } from "node:child_process";
import { commandExists, getEnv } from "./env";
import { PatchPilotError } from "./errors";
import { redact } from "./redaction";

export function generateSbom(projectPath: string): { format: string; output: string } {
  const bin = getEnv("SYFT_BIN") ?? "syft";
  if (!commandExists(bin)) {
    throw new PatchPilotError("sbom_tool_missing", "SBOM generation requires Syft. Install syft or set SYFT_BIN.", { requiredTool: bin });
  }
  const result = spawnSync(bin, [projectPath, "-o", "cyclonedx-json"], { encoding: "utf8" });
  if (result.status !== 0) {
    throw new PatchPilotError("sbom_generation_failed", "Syft failed to generate an SBOM.", { stderr: redact(result.stderr) }, 502);
  }
  return { format: "cyclonedx-json", output: redact(result.stdout) };
}
