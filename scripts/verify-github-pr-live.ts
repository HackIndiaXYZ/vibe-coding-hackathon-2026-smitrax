import { JsonDatabase, PatchPilotError, PatchPilotService, createAuditReceipt } from "../packages/core/src/index.ts";
import { assertGithubWritePermissions, loadDotenvFile, parseTestRepo, safeJson } from "./live-utils.ts";

loadDotenvFile();

async function main() {
  const repo = parseTestRepo();
  await assertGithubWritePermissions(repo);
  const db = new JsonDatabase();
  const service = new PatchPilotService(db);
  let state = db.read();
  const project = [...state.projects].reverse().find((item) => item.sourceType === "github" && item.githubOwner === repo.owner && item.githubRepo === repo.repo);
  if (!project) throw new Error("No live GitHub project found. Run pnpm verify:github-live first.");
  const finding = [...state.findings].reverse().find((item) => item.projectId === project.id && item.status === "fix_available" && item.fixedVersion);
  if (!finding) throw new Error("No fixable finding found for the live GitHub project.");
  const job = await service.startRemediation(finding.id, "deterministic-npm");
  state = db.read();
  const pr = state.pullRequests.find((item) => item.remediationJobId === job.id);
  createAuditReceipt(db, {
    projectId: project.id,
    actorType: "system",
    action: "verification.github_pr_live",
    targetType: "remediation_job",
    targetId: job.id,
    prLink: pr?.url,
    changedFiles: job.changedFiles,
    outputSummary: { status: job.status, prCreated: Boolean(pr?.url) }
  });
  if (!pr?.url) {
    throw new PatchPilotError("github_pr_live_failed", "Live GitHub PR verification did not create a PR.", { status: job.status, errorCode: job.errorCode, errorMessage: job.errorMessage });
  }
  console.log(safeJson({
    ok: true,
    repo: `${repo.owner}/${repo.repo}`,
    remediationJobId: job.id,
    status: job.status,
    changedFiles: job.changedFiles,
    pr: { url: pr.url, branchName: pr.branchName, draft: pr.draft },
    cleanup: [
      `Close draft PR: ${pr.url}`,
      `Delete branch: ${pr.branchName}`
    ]
  }));
}

main().catch((error) => {
  console.error(safeJson({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
