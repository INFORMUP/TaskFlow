import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ProjectRepositoriesSection from "./ProjectRepositoriesSection.vue";

const listProjectRepositories = vi.fn();
const addProjectRepository = vi.fn();
const removeProjectRepository = vi.fn();

vi.mock("@/api/projects.api", () => ({
  listProjectRepositories: (...a: unknown[]) => listProjectRepositories(...a),
  addProjectRepository: (...a: unknown[]) => addProjectRepository(...a),
  removeProjectRepository: (...a: unknown[]) => removeProjectRepository(...a),
}));

const REPOS = [
  {
    id: "r-1",
    projectId: "proj-1",
    provider: "GITHUB",
    owner: "INFORMUP",
    name: "TaskFlow",
    createdAt: "2026-04-22T00:00:00.000Z",
  },
];

beforeEach(() => {
  listProjectRepositories.mockReset();
  addProjectRepository.mockReset();
  removeProjectRepository.mockReset();

  listProjectRepositories.mockResolvedValue(REPOS);
  addProjectRepository.mockResolvedValue({
    id: "r-2",
    projectId: "proj-1",
    provider: "GITHUB",
    owner: "INFORMUP",
    name: "Reportal",
    createdAt: "2026-04-22T00:00:00.000Z",
  });
  removeProjectRepository.mockResolvedValue(undefined);
});

async function mountSection() {
  const wrapper = mount(ProjectRepositoriesSection, {
    props: { projectId: "proj-1" },
  });
  await flushPromises();
  return wrapper;
}

describe("ProjectRepositoriesSection", () => {
  it("lists existing repositories", async () => {
    const wrapper = await mountSection();
    expect(wrapper.find("[data-testid='repo-row-r-1']").exists()).toBe(true);
    expect(wrapper.text()).toContain("INFORMUP/TaskFlow");
  });

  it("submits a new repository", async () => {
    const wrapper = await mountSection();
    await wrapper.get("[data-testid='repo-owner-input']").setValue("INFORMUP");
    await wrapper.get("[data-testid='repo-name-input']").setValue("Reportal");
    await wrapper.get("[data-testid='repo-add-button']").trigger("click");
    await flushPromises();
    expect(addProjectRepository).toHaveBeenCalledWith("proj-1", {
      provider: "GITHUB",
      owner: "INFORMUP",
      name: "Reportal",
    });
  });

  it("removes a repository", async () => {
    const wrapper = await mountSection();
    await wrapper.get("[data-testid='repo-remove-r-1']").trigger("click");
    await flushPromises();
    expect(removeProjectRepository).toHaveBeenCalledWith("proj-1", "r-1");
  });

  it("shows an error if the API rejects with REPO_EXISTS", async () => {
    addProjectRepository.mockRejectedValueOnce({ error: { code: "REPO_EXISTS", message: "dupe" } });
    const wrapper = await mountSection();
    await wrapper.get("[data-testid='repo-owner-input']").setValue("INFORMUP");
    await wrapper.get("[data-testid='repo-name-input']").setValue("TaskFlow");
    await wrapper.get("[data-testid='repo-add-button']").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("dupe");
  });
});
