import { prisma } from "../prisma-client.js";

export interface GithubPullRequestPayload {
  action: string;
  pull_request: {
    number: number;
    merged: boolean;
    merged_at: string | null;
  };
  repository: {
    name: string;
    owner: { login: string };
  };
}

export interface HandlePullRequestEventResult {
  ignored: boolean;
  updated: number;
}

interface StateChange {
  state: "open" | "closed" | "merged";
  mergedAt: Date | null;
}

function deriveStateChange(payload: GithubPullRequestPayload): StateChange | null {
  const { action } = payload;
  if (action === "closed") {
    if (payload.pull_request.merged) {
      const mergedAt = payload.pull_request.merged_at
        ? new Date(payload.pull_request.merged_at)
        : null;
      return { state: "merged", mergedAt };
    }
    return { state: "closed", mergedAt: null };
  }
  if (action === "reopened") {
    return { state: "open", mergedAt: null };
  }
  return null;
}

export async function handlePullRequestEvent(
  payload: GithubPullRequestPayload,
): Promise<HandlePullRequestEventResult> {
  const change = deriveStateChange(payload);
  if (!change) return { ignored: true, updated: 0 };

  const owner = payload.repository.owner.login;
  const name = payload.repository.name;
  const number = payload.pull_request.number;

  const repos = await prisma.projectRepository.findMany({
    where: {
      provider: "GITHUB",
      owner: { equals: owner, mode: "insensitive" },
      name: { equals: name, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (repos.length === 0) return { ignored: true, updated: 0 };

  const result = await prisma.taskPullRequest.updateMany({
    where: { repositoryId: { in: repos.map((r) => r.id) }, number },
    data: { state: change.state, mergedAt: change.mergedAt },
  });

  if (result.count === 0) return { ignored: true, updated: 0 };
  return { ignored: false, updated: result.count };
}
