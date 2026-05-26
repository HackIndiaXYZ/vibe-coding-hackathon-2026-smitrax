import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { getEnv } from "./env";

const EXCLUDES = new Set(["node_modules", ".git", ".next", "dist", "build", ".turbo"]);
const SECRET_FILE_NAMES = new Set([
  ".env",
  ".npmrc",
  ".yarnrc",
  ".pypirc",
  ".netrc",
  "credentials",
  "credentials.json",
  "secret",
  "secrets",
  "secrets.json",
  "token",
  "tokens",
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519"
]);
const SECRET_EXTENSIONS = [".pem", ".key", ".p12", ".pfx"];

export function copyProjectToWorkspace(source: string, destination: string): void {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source)) {
    if (EXCLUDES.has(entry)) continue;
    if (!shouldCopyProjectEntry(entry)) continue;
    const from = path.join(source, entry);
    const to = path.join(destination, entry);
    const stat = statSync(from);
    if (stat.isDirectory()) {
      copyProjectToWorkspace(from, to);
    } else if (stat.isFile() || stat.isSymbolicLink()) {
      cpSync(from, to, { recursive: true });
    }
  }
}

export function ensureCleanDirectory(destination: string): void {
  mkdirSync(destination, { recursive: true });
  if (!existsSync(destination)) mkdirSync(destination, { recursive: true });
}

export function shouldCopyProjectEntry(relativePath: string): boolean {
  return !isSecretLikePath(relativePath);
}

export function isSecretLikePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  const base = path.posix.basename(normalized).toLowerCase();
  if (SECRET_FILE_NAMES.has(base)) return true;
  if (base.startsWith(".env.")) return true;
  if (SECRET_EXTENSIONS.some((extension) => base.endsWith(extension))) return true;
  if (/(^|[-_.])(secret|token|private[-_.]?key)([-_.]|$)/i.test(base)) return true;
  return false;
}

export function retainWorkspaces(): boolean {
  return getEnv("PATCHPILOT_RETAIN_WORKSPACES") === "true";
}

export function cleanupWorkspace(workspace: string): void {
  if (retainWorkspaces()) return;
  rmSync(workspace, { recursive: true, force: true });
}
