import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { PackageManager } from "./types";

export interface PackageManifest {
  name: string;
  packageManager: PackageManager;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  optionalDependencies: Record<string, string>;
  scripts: Record<string, string>;
  manifestPath: string;
  lockfilePath?: string;
  stack: string[];
}

export function detectPackageManager(projectPath: string): PackageManager {
  if (existsSync(path.join(projectPath, "package-lock.json"))) return "npm";
  if (existsSync(path.join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(path.join(projectPath, "yarn.lock"))) return "yarn";
  if (existsSync(path.join(projectPath, "package.json"))) return "npm";
  return "unknown";
}

export function readPackageManifest(projectPath: string): PackageManifest | undefined {
  const manifestPath = path.join(projectPath, "package.json");
  if (!existsSync(manifestPath)) return undefined;
  const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    name?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  const manager = detectPackageManager(projectPath);
  const lockfile =
    manager === "npm" && existsSync(path.join(projectPath, "package-lock.json"))
      ? path.join(projectPath, "package-lock.json")
      : manager === "pnpm" && existsSync(path.join(projectPath, "pnpm-lock.yaml"))
        ? path.join(projectPath, "pnpm-lock.yaml")
        : manager === "yarn" && existsSync(path.join(projectPath, "yarn.lock"))
          ? path.join(projectPath, "yarn.lock")
          : undefined;
  const deps = parsed.dependencies ?? {};
  const devDeps = parsed.devDependencies ?? {};
  const stack = ["node", manager].filter((x) => x !== "unknown");
  return {
    name: parsed.name ?? path.basename(projectPath),
    packageManager: manager,
    dependencies: deps,
    devDependencies: devDeps,
    optionalDependencies: parsed.optionalDependencies ?? {},
    scripts: parsed.scripts ?? {},
    manifestPath,
    lockfilePath: lockfile,
    stack
  };
}
