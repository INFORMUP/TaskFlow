import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import TaskNewView from "./TaskNewView.vue";

const createTask = vi.fn();
const listProjects = vi.fn();
const listProjectFlows = vi.fn();
const listFlows = vi.fn();
const listFlowStatuses = vi.fn();
const listLabels = vi.fn();
const attachLabelToTask = vi.fn();
const createTransition = vi.fn();
const apiFetch = vi.fn();

vi.mock("@/api/tasks.api", () => ({
  createTask: (...a: unknown[]) => createTask(...a),
}));
vi.mock("@/api/projects.api", () => ({
  listProjects: (...a: unknown[]) => listProjects(...a),
  listProjectFlows: (...a: unknown[]) => listProjectFlows(...a),
}));
vi.mock("@/api/flows.api", () => ({
  listFlows: (...a: unknown[]) => listFlows(...a),
  listFlowStatuses: (...a: unknown[]) => listFlowStatuses(...a),
}));
vi.mock("@/api/labels.api", () => ({
  listLabels: (...a: unknown[]) => listLabels(...a),
  attachLabelToTask: (...a: unknown[]) => attachLabelToTask(...a),
}));
vi.mock("@/api/transitions.api", () => ({
  createTransition: (...a: unknown[]) => createTransition(...a),
}));
vi.mock("@/api/client", () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
}));

const ALICE = { id: "u-1", displayName: "Alice", actorType: "human" };
const FEATURE_FLOW = { id: "f-1", slug: "feature", name: "Feature", isDefault: true };

beforeEach(() => {
  createTask.mockReset();
  listProjects.mockReset();
  listProjectFlows.mockReset();
  listFlows.mockReset();
  listFlowStatuses.mockReset();
  listLabels.mockReset();
  attachLabelToTask.mockReset();
  createTransition.mockReset();
  apiFetch.mockReset();

  listProjects.mockResolvedValue([
    { id: "p-1", key: "TF", name: "TaskFlow", defaultAssignee: ALICE },
  ]);
  listProjectFlows.mockResolvedValue([FEATURE_FLOW]);
  listFlows.mockResolvedValue([FEATURE_FLOW]);
  listFlowStatuses.mockResolvedValue([
    { id: "s-1", slug: "discuss", name: "Discuss", description: null, sortOrder: 0 },
  ]);
  listLabels.mockResolvedValue([]);
  apiFetch.mockResolvedValue({ data: [ALICE] });

  createTask.mockResolvedValue({
    id: "task-abc",
    displayId: "TF-7",
    flow: { id: "f-1", slug: "feature", name: "Feature" },
    currentStatus: { id: "s-1", slug: "discuss", name: "Discuss" },
  });
});

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/tasks/new", name: "task-new", component: TaskNewView },
      { path: "/tasks/:flow/:taskId", name: "task-detail", component: { template: "<div />" } },
      { path: "/flows", name: "flow-list", component: { template: "<div />" } },
    ],
  });
}

describe("TaskNewView", () => {
  it("renders a New Task heading and the create form", async () => {
    const router = makeRouter();
    await router.push("/tasks/new");
    await router.isReady();
    const wrapper = mount(TaskNewView, { global: { plugins: [router] } });
    await flushPromises();
    expect(wrapper.text()).toContain("New Task");
    expect(wrapper.find(".create-form").exists()).toBe(true);
  });

  it("navigates to the new task's detail page after successful creation", async () => {
    const router = makeRouter();
    await router.push("/tasks/new");
    await router.isReady();
    const wrapper = mount(TaskNewView, { global: { plugins: [router] } });
    await flushPromises();

    await wrapper.get('input[type="checkbox"]').setValue(true);
    await flushPromises();
    await wrapper.get('input[placeholder="Title"]').setValue("Hello");
    await wrapper.get(".create-form__submit").trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe("/tasks/feature/task-abc");
  });

  it("navigates back to /flows on cancel", async () => {
    const router = makeRouter();
    await router.push("/tasks/new");
    await router.isReady();
    const wrapper = mount(TaskNewView, { global: { plugins: [router] } });
    await flushPromises();

    await wrapper.get(".create-form__cancel").trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toBe("/flows");
  });
});
