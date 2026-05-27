import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { dataFilePath } from "./env";
import { loadStateFromPostgres, mirrorStateToPostgres, postgresEnabled } from "./postgresStore";
import type { PatchPilotState } from "./types";

export const emptyState = (): PatchPilotState => ({
  projects: [],
  scanJobs: [],
  vulnerabilities: [],
  findings: [],
  riskSignals: [],
  remediationJobs: [],
  jobEvents: [],
  validationRuns: [],
  pullRequests: [],
  approvals: [],
  auditReceipts: [],
  agentFindings: [],
  settings: {},
  watchRuns: [],
  watchAlerts: [],
  providerConsents: [],
  scannerFindings: []
});

export class JsonDatabase {
  constructor(private filePath = dataFilePath()) {}

  read(): PatchPilotState {
    try {
      const raw = readFileSync(this.filePath, "utf8");
      return { ...emptyState(), ...JSON.parse(raw) } as PatchPilotState;
    } catch {
      return emptyState();
    }
  }

  write(state: PatchPilotState): PatchPilotState {
    mkdirSync(path.dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(state, null, 2));
    // Durable mirror to Postgres when enabled (best-effort, never blocks).
    mirrorStateToPostgres(state);
    return state;
  }

  update(mutator: (state: PatchPilotState) => void): PatchPilotState {
    const state = this.read();
    mutator(state);
    return this.write(state);
  }
}

/**
 * Hydrates the local file store from Postgres (durable system of record) when
 * Postgres persistence is enabled and has a stored document. Returns true when
 * the local file was (re)written from Postgres.
 */
export async function hydrateFromPostgres(db = new JsonDatabase()): Promise<boolean> {
  if (!postgresEnabled()) return false;
  const remote = await loadStateFromPostgres();
  if (!remote) return false;
  db.write({ ...emptyState(), ...remote });
  return true;
}

export function id(prefix: string): string {
  return `${prefix}_${nanoid(10)}`;
}

export function now(): string {
  return new Date().toISOString();
}
