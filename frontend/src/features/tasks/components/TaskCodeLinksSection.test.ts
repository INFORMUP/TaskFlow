import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import TaskCodeLinksSection from "./TaskCodeLinksSection.vue";

const listTaskCommits = vi.fn();
const listTaskPullRequests = vi.fn();
const createTaskCommit = vi.fn();
const createTaskPullRequest = vi.fn();
const deleteTaskCommit = vi.fn();
const deleteTaskPullRequest = vi.fn();

vi.mock("@/api/task-code-links.api", () => ({
  listTaskCommits: (...a: unknown[]) => listTaskCommits(...a),
  listTaskPullRequests: (...a: unknown[]) => listTaskPullRequests(...a),
  createTaskCommit: (...a: unknown[]) => createTaskCommit(...a),
  createTaskPullRequest: (...a: unknown[]) => createTaskPullRequest(...a),
  deleteTaskCommit: (...a: unknown[]) => deleteTaskCommit(...a),
  deleteTaskPullRequest: (...a: unknown[]) => deleteTaskPullRequest(...a),
}));

const REPO = { id: "r-1", provider: "GITHUB", owner: "INFORMUP", name: "TaskFlow" };

const COMMIT = {
  id: "c-1",
  taskId: "t-1",
  repositoryId: "r-1",
  repository: REPO,
  sha: "abcdef0123456789abcdef0123456789abcdef01",
  message: "fix: thing",
  author: null,
  authoredAt: null,
  url: "https://github.com/INFORMUP/TaskFlow/commit/abcdef0",
  createdAt: "2026-04-26T00:00:00.000Z",
};

const PR = {
  id: "p-1",
  taskId: "t-1",
  repositoryId: "r-1",
  repository: REPO,
  number: 42,
  title: "Add thing",
  state: "open",
  author: null,
  mergedAt: null,
  url: "https://github.com/INFORMUP/TaskFlow/pull/42",
  createdAt: "2026-04-26T00:00:00.000Z",
};

beforeEach(() => {
  listTaskCommits.mockReset();
  listTaskPullRequests.mockReset();
  createTaskCommit.mockReset();
  createTaskPullRequest.mockReset();
  deleteTaskCommit.mockReset();
  deleteTaskPullRequest.mockReset();

  listTaskCommits.mockResolvedValue([COMMIT]);
  listTaskPullRequests.mockResolvedValue([PR]);
  createTaskCommit.mockResolvedValue({ ...COMMIT, id: "c-2", sha: "1".repeat(40) });
  createTaskPullRequest.mockResolvedValue({ ...PR, id: "p-2", number: 43 });
  deleteTaskCommit.mockResolvedValue(undefined);
  deleteTaskPullRequest.mockResolvedValue(undefined);
});

async function mountSection() {
  const wrapper = mount(TaskCodeLinksSection, { props: { taskId: "t-1" } });
  await flushPromises();
  return wrapper;
}

describe("TaskCodeLinksSection", () => {
  it("lists existing commits and PRs", async () => {
    const wrapper = await mountSection();
    expect(wrapper.find("[data-testid='commit-row-c-1']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='pr-row-p-1']").exists()).toBe(true);
    expect(wrapper.text()).toContain("#42");
    expect(wrapper.text()).toContain("abcdef0");
  });

  it("submits a SHA as { sha }", async () => {
    const wrapper = await mountSection();
    await wrapper
      .get("[data-testid='commit-input']")
      .setValue("ffffffffffffffffffffffffffffffffffffffff");
    await wrapper.get("[data-testid='commit-add-button']").trigger("click");
    await flushPromises();
    expect(createTaskCommit).toHaveBeenCalledWith("t-1", {
      sha: "ffffffffffffffffffffffffffffffffffffffff",
    });
  });

  it("submits a commit URL as { url }", async () => {
    const wrapper = await mountSection();
    const url = "https://github.com/INFORMUP/TaskFlow/commit/abcdef0";
    await wrapper.get("[data-testid='commit-input']").setValue(url);
    await wrapper.get("[data-testid='commit-add-button']").trigger("click");
    await flushPromises();
    expect(createTaskCommit).toHaveBeenCalledWith("t-1", { url });
  });

  it("submits a PR number as { number }", async () => {
    const wrapper = await mountSection();
    await wrapper.get("[data-testid='pr-input']").setValue("99");
    await wrapper.get("[data-testid='pr-add-button']").trigger("click");
    await flushPromises();
    expect(createTaskPullRequest).toHaveBeenCalledWith("t-1", { number: 99 });
  });

  it("submits a PR URL as { url }", async () => {
    const wrapper = await mountSection();
    const url = "https://github.com/INFORMUP/TaskFlow/pull/99";
    await wrapper.get("[data-testid='pr-input']").setValue(url);
    await wrapper.get("[data-testid='pr-add-button']").trigger("click");
    await flushPromises();
    expect(createTaskPullRequest).toHaveBeenCalledWith("t-1", { url });
  });

  it("removes a commit", async () => {
    const wrapper = await mountSection();
    await wrapper.get("[data-testid='commit-remove-c-1']").trigger("click");
    await flushPromises();
    expect(deleteTaskCommit).toHaveBeenCalledWith("t-1", "c-1");
  });

  it("removes a PR", async () => {
    const wrapper = await mountSection();
    await wrapper.get("[data-testid='pr-remove-p-1']").trigger("click");
    await flushPromises();
    expect(deleteTaskPullRequest).toHaveBeenCalledWith("t-1", "p-1");
  });

  it("shows an error if the API rejects", async () => {
    createTaskCommit.mockRejectedValueOnce({
      error: { code: "REPO_NOT_ON_TASK_PROJECT", message: "wrong repo" },
    });
    const wrapper = await mountSection();
    await wrapper.get("[data-testid='commit-input']").setValue("a".repeat(40));
    await wrapper.get("[data-testid='commit-add-button']").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("wrong repo");
  });

  it("shows a validation error for unparseable input", async () => {
    const wrapper = await mountSection();
    await wrapper.get("[data-testid='commit-input']").setValue("not-a-sha-or-url");
    await wrapper.get("[data-testid='commit-add-button']").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("Enter a commit URL or SHA");
    expect(createTaskCommit).not.toHaveBeenCalled();
  });
});
