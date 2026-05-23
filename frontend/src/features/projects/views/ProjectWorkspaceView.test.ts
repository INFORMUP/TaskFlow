import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import ProjectWorkspaceView from "./ProjectWorkspaceView.vue";
import type { Task } from "@/api/tasks.api";
import type { Project, AttachedFlow } from "@/api/projects.api";

const getProject = vi.fn();
const listProjectFlows = vi.fn();
const getTasks = vi.fn();
const updateTask = vi.fn();
const listOrgMembers = vi.fn();

vi.mock("@/api/projects.api", () => ({
  getProject: (...a: unknown[]) => getProject(...a),
  listProjectFlows: (...a: unknown[]) => listProjectFlows(...a),
}));
vi.mock("@/api/tasks.api", () => ({
  getTasks: (...a: unknown[]) => getTasks(...a),
  updateTask: (...a: unknown[]) => updateTask(...a),
}));
vi.mock("@/api/org-members.api", () => ({
  listOrgMembers: (...a: unknown[]) => listOrgMembers(...a),
}));

const currentUser = vi.hoisted(() => ({
  value: { teams: [{ slug: "engineer" }] } as { teams: { slug: string }[] } | null,
}));
vi.mock("@/composables/useCurrentUser", () => ({
  useCurrentUser: () => ({ user: currentUser }),
}));

const HUMAN = { id: "u-1", displayName: "Alice", actorType: "human" };

const PROJECT: Project = {
  id: "p-1",
  key: "TF",
  name: "TaskFlow",
  owner: HUMAN,
  defaultAssignee: null,
  defaultFlow: { id: "f-feature", slug: "feature", name: "Feature" },
  teams: [],
  color: "#a855f7",
  createdAt: "2026-04-10T10:00:00.000Z",
  archivedAt: null,
};

const FLOWS: AttachedFlow[] = [
  { id: "f-bug", slug: "bug", name: "Bug", description: null, isDefault: false },
  { id: "f-feature", slug: "feature", name: "Feature", description: null, isDefault: true },
];

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    displayId: "FEAT-1",
    title: "A task",
    description: null,
    priority: "medium",
    resolution: null,
    dueDate: null,
    flow: { id: "f-feature", slug: "feature", name: "Feature" },
    currentStatus: { id: "s-design", slug: "design", name: "Design" },
    creator: HUMAN,
    assignee: HUMAN,
    projects: [{ id: "p-1", key: "TF", name: "TaskFlow", owner: HUMAN, color: "#a855f7" }],
    createdAt: "2026-04-10T10:00:00.000Z",
    updatedAt: "2026-04-10T10:00:00.000Z",
    ...overrides,
  };
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/projects/:id", name: "project-workspace", component: ProjectWorkspaceView },
      { path: "/projects/:id/settings", name: "project-settings", component: { template: "<div />" } },
      { path: "/tasks/:flow", name: "task-board", component: { template: "<div />" } },
      { path: "/tasks/:flow/:taskId", name: "task-detail", component: { template: "<div />" } },
    ],
  });
}

async function mountView() {
  const router = makeRouter();
  await router.push("/projects/p-1");
  await router.isReady();
  const wrapper = mount(ProjectWorkspaceView, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  getProject.mockReset();
  listProjectFlows.mockReset();
  getTasks.mockReset();
  updateTask.mockReset();
  listOrgMembers.mockReset();
  currentUser.value = { teams: [{ slug: "engineer" }] };

  getProject.mockResolvedValue(PROJECT);
  listProjectFlows.mockResolvedValue(FLOWS);
  listOrgMembers.mockResolvedValue([HUMAN]);
  getTasks.mockImplementation((params: { flow?: string }) => {
    const isBug = params.flow === "bug";
    return Promise.resolve({
      data: [
        isBug
          ? task({ id: "t-bug", displayId: "BUG-7", title: "A bug", flow: { id: "f-bug", slug: "bug", name: "Bug" } })
          : task({ id: "t-feat", displayId: "FEAT-2", title: "A feature" }),
      ],
      pagination: { cursor: null, hasMore: false },
    });
  });
});

describe("ProjectWorkspaceView", () => {
  it("renders the project key and name in the header", async () => {
    const { wrapper } = await mountView();
    const title = wrapper.find("[data-testid='workspace-title']");
    expect(title.exists()).toBe(true);
    expect(title.text()).toContain("TF");
    expect(title.text()).toContain("TaskFlow");
  });

  it("renders a tab for each of the project's attached flows", async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find("[data-testid='workspace-flow-tab-bug']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='workspace-flow-tab-feature']").exists()).toBe(true);
  });

  it("selects the default flow on load and lists that flow's tasks filtered by projectId", async () => {
    const { wrapper } = await mountView();

    expect(getTasks).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "p-1", flow: "feature" }),
    );
    const featureTab = wrapper.find("[data-testid='workspace-flow-tab-feature']");
    expect(featureTab.attributes("aria-pressed")).toBe("true");
    expect(wrapper.text()).toContain("FEAT-2");
  });

  it("switching to another flow tab loads that flow's tasks", async () => {
    const { wrapper } = await mountView();

    await wrapper.find("[data-testid='workspace-flow-tab-bug']").trigger("click");
    await flushPromises();

    expect(getTasks).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "p-1", flow: "bug" }),
    );
    expect(wrapper.find("[data-testid='workspace-flow-tab-bug']").attributes("aria-pressed")).toBe("true");
    expect(wrapper.text()).toContain("BUG-7");
  });

  it("shows the settings gear linking to /projects/:id/settings for write-permission users", async () => {
    currentUser.value = { teams: [{ slug: "product" }] };
    const { wrapper } = await mountView();

    const gear = wrapper.find("[data-testid='workspace-settings-gear']");
    expect(gear.exists()).toBe(true);
    expect(gear.attributes("href")).toBe("/projects/p-1/settings");
  });

  it("hides the settings gear for users without write permission", async () => {
    currentUser.value = { teams: [{ slug: "user" }] };
    const { wrapper } = await mountView();

    expect(wrapper.find("[data-testid='workspace-settings-gear']").exists()).toBe(false);
  });

  it("shows an empty state when the selected flow has no tasks", async () => {
    getTasks.mockResolvedValue({ data: [], pagination: { cursor: null, hasMore: false } });
    const { wrapper } = await mountView();

    expect(wrapper.find("[data-testid='workspace-empty']").exists()).toBe(true);
  });
});
