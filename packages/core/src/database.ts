import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { dataFilePath } from "./env";
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
  providerConsents: []
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
    return state;
  }

  update(mutator: (state: PatchPilotState) => void): PatchPilotState {
    const state = this.read();
    mutator(state);
    return this.write(state);
  }
}

export function id(prefix: string): string {
  return `${prefix}_${nanoid(10)}`;
}

export function now(): string {
  return new Date().toISOString();
}
