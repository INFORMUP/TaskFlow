import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import MyWorkView from "./MyWorkView.vue";
import type { Task } from "@/api/tasks.api";
import type { Flow, FlowStatus } from "@/api/flows.api";

const getTasks = vi.fn();
const listFlows = vi.fn();
const listFlowStatuses = vi.fn();

vi.mock("@/api/tasks.api", () => ({
  getTasks: (...a: unknown[]) => getTasks(...a),
}));
vi.mock("@/api/flows.api", () => ({
  listFlows: (...a: unknown[]) => listFlows(...a),
  listFlowStatuses: (...a: unknown[]) => listFlowStatuses(...a),
}));

const HUMAN = { id: "u-1", displayName: "Alice", actorType: "human" };

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
    projects: [],
    createdAt: "2026-04-10T10:00:00.000Z",
    updatedAt: "2026-04-10T10:00:00.000Z",
    ...overrides,
  };
}

const featureStatuses: FlowStatus[] = [
  { id: "s-discuss", slug: "discuss", name: "Discuss", description: null, sortOrder: 1 },
  { id: "s-design", slug: "design", name: "Design", description: null, sortOrder: 2 },
  { id: "s-implement", slug: "implement", name: "Implement", description: null, sortOrder: 3 },
  { id: "s-closed", slug: "closed", name: "Closed", description: null, sortOrder: 4 },
];

const flows: Flow[] = [
  { id: "f-feature", slug: "feature", name: "Feature", description: null },
];

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "my-work", component: MyWorkView },
      { path: "/tasks/:flow/:taskId", name: "task-detail", component: { template: "<div />" } },
      { path: "/flows", name: "flow-list", component: { template: "<div />" } },
      { path: "/projects", name: "project-list", component: { template: "<div />" } },
    ],
  });
}

async function mountView() {
  const router = makeRouter();
  await router.push("/");
  await router.isReady();
  const wrapper = mount(MyWorkView, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  getTasks.mockReset();
  listFlows.mockReset();
  listFlowStatuses.mockReset();
  listFlows.mockResolvedValue(flows);
  listFlowStatuses.mockResolvedValue(featureStatuses);
});

describe("MyWorkView", () => {
  it("renders groups in order: In progress, To do, Done", async () => {
    getTasks.mockResolvedValue({
      data: [
        task({ id: "t-todo", displayId: "FEAT-2", title: "Todo task", currentStatus: { id: "s-discuss", slug: "discuss", name: "Discuss" } }),
        task({ id: "t-prog", displayId: "FEAT-3", title: "Progress task", currentStatus: { id: "s-design", slug: "design", name: "Design" } }),
        task({
          id: "t-done",
          displayId: "FEAT-4",
          title: "Done task",
          resolution: "completed",
          currentStatus: { id: "s-closed", slug: "closed", name: "Closed" },
          updatedAt: new Date().toISOString(),
        }),
      ],
      pagination: { cursor: null, hasMore: false },
    });

    const { wrapper } = await mountView();

    const headings = wrapper.findAll("[data-testid^='my-work-group-heading-']").map((h) => h.text());
    expect(headings).toEqual([
      expect.stringMatching(/In progress/i),
      expect.stringMatching(/To do/i),
      expect.stringMatching(/Done/i),
    ]);
  });

  it("hides empty sections", async () => {
    getTasks.mockResolvedValue({
      data: [
        task({ id: "t-prog", displayId: "FEAT-3", title: "Progress task", currentStatus: { id: "s-design", slug: "design", name: "Design" } }),
      ],
      pagination: { cursor: null, hasMore: false },
    });

    const { wrapper } = await mountView();

    const headings = wrapper.findAll("[data-testid^='my-work-group-heading-']").map((h) => h.text());
    expect(headings).toHaveLength(1);
    expect(headings[0]).toMatch(/In progress/i);
  });

  it("clicking a card navigates to the task detail route", async () => {
    getTasks.mockResolvedValue({
      data: [
        task({ id: "t-prog", displayId: "FEAT-3", title: "Progress task", currentStatus: { id: "s-design", slug: "design", name: "Design" } }),
      ],
      pagination: { cursor: null, hasMore: false },
    });

    const { wrapper, router } = await mountView();
    const push = vi.spyOn(router, "push");

    await wrapper.find("[data-testid='my-work-card-FEAT-3']").trigger("click");
    await flushPromises();

    expect(push).toHaveBeenCalledWith("/tasks/feature/t-prog");
  });

  it("renders an error state when the API fails", async () => {
    getTasks.mockRejectedValue({ error: { message: "boom" } });

    const { wrapper } = await mountView();

    expect(wrapper.text()).toContain("boom");
  });

  it("renders an empty state with links to /flows and /projects when there are no tasks", async () => {
    getTasks.mockResolvedValue({ data: [], pagination: { cursor: null, hasMore: false } });

    const { wrapper } = await mountView();

    const empty = wrapper.find("[data-testid='my-work-empty']");
    expect(empty.exists()).toBe(true);
    expect(empty.html()).toContain('href="/flows"');
    expect(empty.html()).toContain('href="/projects"');
  });
});
