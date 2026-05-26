import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { PatchPilotError } from "./errors";

export const pluginManifestSchema = z.object({
  id: z.string().min(3),
  version: z.string().min(1),
  entry: z.string().min(1),
  permissions: z.array(z.string()).default([])
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

const DANGEROUS_PERMISSIONS = new Set(["filesystem:write", "network:any", "secrets:read", "process:exec"]);

export function validatePluginManifest(filePath: string): { manifest: PluginManifest; warnings: string[] } {
  if (!existsSync(filePath)) throw new PatchPilotError("plugin_manifest_missing", "Plugin manifest file does not exist.", { filePath });
  const manifest = pluginManifestSchema.parse(JSON.parse(readFileSync(filePath, "utf8")));
  const warnings = manifest.permissions.filter((permission) => DANGEROUS_PERMISSIONS.has(permission)).map((permission) => `Permission ${permission} requires explicit review.`);
  return { manifest, warnings };
}
