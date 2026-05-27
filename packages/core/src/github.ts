import { Octokit } from "@octokit/rest";
import { getEnv } from "./env";
import { PatchPilotError } from "./errors";

export function githubClient(): Octokit {
  const token = getEnv("GITHUB_TOKEN");
  if (!token) throw new PatchPilotError("github_token_missing", "Set GITHUB_TOKEN to use GitHub repository and PR operations.", { requiredEnv: "GITHUB_TOKEN" });
  return new Octokit({ auth: token });
}

export async function validateGithubRepo(owner: string, repo: string) {
  try {
    const client = githubClient();
    const response = await client.repos.get({ owner, repo });
    return {
      name: response.data.name,
      fullName: response.data.full_name,
      defaultBranch: response.data.default_branch,
      cloneUrl: response.data.clone_url,
      private: response.data.private,
      archived: response.data.archived
    };
  } catch (error) {
    if (error instanceof PatchPilotError) throw error;
    throw new PatchPilotError("github_repo_not_accessible", "GitHub repo could not be validated with the configured token.", { owner, repo }, 502);
  }
}

/** Closes a pull request (no merge). Used for rollback of a PatchPilot draft PR. */
export async function closePullRequest(owner: string, repo: string, pullNumber: number): Promise<void> {
  const client = githubClient();
  try {
    await client.pulls.update({ owner, repo, pull_number: pullNumber, state: "closed" });
  } catch (error) {
    throw new PatchPilotError("github_pr_close_failed", "GitHub pull request close failed.", { error: error instanceof Error ? error.message : String(error) }, 502);
  }
}

/** Deletes a branch ref. Best-effort: a missing branch is treated as already gone. */
export async function deleteBranchRef(owner: string, repo: string, branch: string): Promise<void> {
  const client = githubClient();
  try {
    await client.git.deleteRef({ owner, repo, ref: `heads/${branch}` });
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 422 || status === 404) return; // already deleted
    throw new PatchPilotError("github_branch_delete_failed", "GitHub branch deletion failed.", { error: error instanceof Error ? error.message : String(error) }, 502);
  }
}

export async function createDraftPullRequest(input: {
  owner: string;
  repo: string;
  title: string;
  head: string;
  base: string;
  body: string;
}) {
  const client = githubClient();
  try {
    const response = await client.pulls.create({ ...input, draft: true });
    return { number: response.data.number, url: response.data.html_url };
  } catch (error) {
    throw new PatchPilotError("github_pr_create_failed", "GitHub pull request creation failed; no PR URL was stored.", { error: error instanceof Error ? error.message : String(error) }, 502);
  }
}
