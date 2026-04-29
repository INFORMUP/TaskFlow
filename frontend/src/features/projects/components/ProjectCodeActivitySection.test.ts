import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises, RouterLinkStub } from "@vue/test-utils";
import ProjectCodeActivitySection from "./ProjectCodeActivitySection.vue";

const listProjectRepositories = vi.fn();
const listProjectCommits = vi.fn();
const listProjectPullRequests = vi.fn();

vi.mock("@/api/projects.api", () => ({
  listProjectRepositories: (...a: unknown[]) => listProjectRepositories(...a),
}));
vi.mock("@/api/project-code-activity.api", () => ({
  listProjectCommits: (...a: unknown[]) => listProjectCommits(...a),
  listProjectPullRequests: (...a: unknown[]) => listProjectPullRequests(...a),
}));

const REPO_ONE = {
  id: "repo-1",
  projectId: "proj-1",
  provider: "GITHUB",
  owner: "INFORMUP",
  name: "RepoOne",
  createdAt: "2026-04-22T00:00:00.000Z",
};
const REPO_TWO = {
  id: "repo-2",
  projectId: "proj-1",
  provider: "GITHUB",
  owner: "INFORMUP",
  name: "RepoTwo",
  createdAt: "2026-04-22T00:00:00.000Z",
};

const COMMIT_FIXTURE = {
  id: "c-1",
  taskId: "task-1",
  repositoryId: "repo-1",
  repository: { id: "repo-1", provider: "GITHUB", owner: "INFORMUP", name: "RepoOne" },
  task: {
    id: "task-1",
    displayId: "BUG-1",
    title: "Fix the thing",
    flow: { id: "f-1", slug: "bug", name: "Bug" },
  },
  sha: "abcdef0123456789abcdef0123456789abcdef01",
  message: "fix: thing",
  author: null,
  authoredAt: null,
  url: "https://github.com/INFORMUP/RepoOne/commit/abcdef0123456789abcdef0123456789abcdef01",
  createdAt: "2026-04-22T00:00:00.000Z",
};

const PR_FIXTURE = {
  id: "pr-1",
  taskId: "task-2",
  repositoryId: "repo-1",
  repository: { id: "repo-1", provider: "GITHUB", owner: "INFORMUP", name: "RepoOne" },
  task: {
    id: "task-2",
    displayId: "FEAT-2",
    title: "Add the thing",
    flow: { id: "f-2", slug: "feature", name: "Feature" },
  },
  number: 42,
  title: "Add the thing PR",
  state: "open",
  author: null,
  mergedAt: null,
  url: "https://github.com/INFORMUP/RepoOne/pull/42",
  createdAt: "2026-04-22T00:00:00.000Z",
};

beforeEach(() => {
  listProjectRepositories.mockReset();
  listProjectCommits.mockReset();
  listProjectPullRequests.mockReset();
  listProjectRepositories.mockResolvedValue([REPO_ONE]);
  listProjectCommits.mockResolvedValue({
    data: [COMMIT_FIXTURE],
    pagination: { cursor: null, hasMore: false },
  });
  listProjectPullRequests.mockResolvedValue({
    data: [PR_FIXTURE],
    pagination: { cursor: null, hasMore: false },
  });
});

async function mountSection() {
  const wrapper = mount(ProjectCodeActivitySection, {
    props: { projectId: "proj-1" },
    global: { stubs: { RouterLink: RouterLinkStub } },
  });
  await flushPromises();
  return wrapper;
}

describe("ProjectCodeActivitySection", () => {
  it("renders commits and PRs with task links", async () => {
    const wrapper = await mountSection();
    expect(wrapper.find("[data-testid='activity-commit-c-1']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='activity-pr-pr-1']").exists()).toBe(true);

    const links = wrapper.findAllComponents(RouterLinkStub);
    const targets = links.map((l) => l.props("to"));
    expect(targets).toContain("/tasks/bug/task-1");
    expect(targets).toContain("/tasks/feature/task-2");
  });

  it("hides the repository filter when there is only one repository", async () => {
    const wrapper = await mountSection();
    expect(wrapper.find("[data-testid='activity-repo-filter']").exists()).toBe(false);
  });

  it("shows the repository filter when there are multiple repositories", async () => {
    listProjectRepositories.mockResolvedValueOnce([REPO_ONE, REPO_TWO]);
    const wrapper = await mountSection();
    expect(wrapper.find("[data-testid='activity-repo-filter']").exists()).toBe(true);
  });

  it("re-fetches when the repository filter changes", async () => {
    listProjectRepositories.mockResolvedValueOnce([REPO_ONE, REPO_TWO]);
    const wrapper = await mountSection();
    listProjectCommits.mockClear();
    listProjectPullRequests.mockClear();
    await wrapper.get("[data-testid='activity-repo-filter']").setValue("repo-2");
    await flushPromises();
    expect(listProjectCommits).toHaveBeenCalledWith("proj-1", {
      repositoryId: "repo-2",
      limit: 10,
    });
    expect(listProjectPullRequests).toHaveBeenCalledWith("proj-1", {
      repositoryId: "repo-2",
      state: "open",
      limit: 10,
    });
  });

  it("shows empty states when there are no commits or open PRs", async () => {
    listProjectCommits.mockResolvedValueOnce({
      data: [],
      pagination: { cursor: null, hasMore: false },
    });
    listProjectPullRequests.mockResolvedValueOnce({
      data: [],
      pagination: { cursor: null, hasMore: false },
    });
    const wrapper = await mountSection();
    expect(wrapper.find("[data-testid='activity-commits-empty']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='activity-prs-empty']").exists()).toBe(true);
  });

  it("renders nothing when the project has no repositories", async () => {
    listProjectRepositories.mockResolvedValueOnce([]);
    const wrapper = await mountSection();
    expect(wrapper.find("section").exists()).toBe(false);
    expect(listProjectCommits).not.toHaveBeenCalled();
    expect(listProjectPullRequests).not.toHaveBeenCalled();
  });
});
