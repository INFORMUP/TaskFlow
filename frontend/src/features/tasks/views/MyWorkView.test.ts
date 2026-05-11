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
  { id: "s-discuss", slug: "discuss", name: "Discuss", description: null, sortOrder: 1, color: null },
  { id: "s-design", slug: "design", name: "Design", description: null, sortOrder: 2, color: null },
  { id: "s-implement", slug: "implement", name: "Implement", description: null, sortOrder: 3, color: null },
  { id: "s-closed", slug: "closed", name: "Closed", description: null, sortOrder: 4, color: null },
];

const flows: Flow[] = [
  {
    id: "f-feature",
    slug: "feature",
    name: "Feature",
    description: null,
    icon: null,
    stats: { openCount: 0, assignedToMeCount: 0 },
  },
];

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "my-work", component: MyWorkView },
      { path: "/tasks/:flow/:taskId", name: "task-detail", component: { template: "<div />" } },
      { path: "/tasks/:flow", name: "task-board", component: { template: "<div />" } },
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
  it("renders all three status groups in order: In progress, To do, Done", async () => {
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

  it("renders empty status groups with a zero count rather than hiding them", async () => {
    getTasks.mockResolvedValue({
      data: [
        task({ id: "t-prog", displayId: "FEAT-3", currentStatus: { id: "s-design", slug: "design", name: "Design" } }),
      ],
      pagination: { cursor: null, hasMore: false },
    });

    const { wrapper } = await mountView();

    const headings = wrapper.findAll("[data-testid^='my-work-group-heading-']");
    expect(headings).toHaveLength(3);
    // The empty "To do" and "Done" groups show 0; In progress shows 1.
    expect(wrapper.find("[data-testid='my-work-group-heading-in_progress']").text()).toMatch(/1/);
    expect(wrapper.find("[data-testid='my-work-group-heading-todo']").text()).toMatch(/0/);
    expect(wrapper.find("[data-testid='my-work-group-heading-done']").text()).toMatch(/0/);
  });

  it("expands In progress by default and collapses To do and Done", async () => {
    getTasks.mockResolvedValue({
      data: [
        task({ id: "t-todo", displayId: "FEAT-2", currentStatus: { id: "s-discuss", slug: "discuss", name: "Discuss" } }),
        task({ id: "t-prog", displayId: "FEAT-3" }),
        task({
          id: "t-done",
          displayId: "FEAT-4",
          resolution: "completed",
          currentStatus: { id: "s-closed", slug: "closed", name: "Closed" },
          updatedAt: new Date().toISOString(),
        }),
      ],
      pagination: { cursor: null, hasMore: false },
    });

    const { wrapper } = await mountView();

    expect(wrapper.find("[data-testid='my-work-card-FEAT-3']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='my-work-card-FEAT-2']").exists()).toBe(false);
    expect(wrapper.find("[data-testid='my-work-card-FEAT-4']").exists()).toBe(false);
  });

  it("toggling a group heading expands or collapses its task list", async () => {
    getTasks.mockResolvedValue({
      data: [
        task({ id: "t-todo", displayId: "FEAT-2", currentStatus: { id: "s-discuss", slug: "discuss", name: "Discuss" } }),
      ],
      pagination: { cursor: null, hasMore: false },
    });

    const { wrapper } = await mountView();

    expect(wrapper.find("[data-testid='my-work-card-FEAT-2']").exists()).toBe(false);
    await wrapper.find("[data-testid='my-work-group-heading-todo']").trigger("click");
    expect(wrapper.find("[data-testid='my-work-card-FEAT-2']").exists()).toBe(true);
  });

  it("hides Up next when no task qualifies as urgent", async () => {
    // Fresh, low-priority, no due date, mid-flow — score stays below the threshold.
    const now = new Date().toISOString();
    getTasks.mockResolvedValue({
      data: [
        task({ id: "t-prog", displayId: "FEAT-3", priority: "low", updatedAt: now, createdAt: now }),
      ],
      pagination: { cursor: null, hasMore: false },
    });

    const { wrapper } = await mountView();

    expect(wrapper.find("[data-testid='my-work-up-next']").exists()).toBe(false);
  });

  it("shows an overdue task in Up next with reason kind 'overdue'", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    getTasks.mockResolvedValue({
      data: [task({ id: "t-overdue", displayId: "FEAT-9", dueDate: yesterday })],
      pagination: { cursor: null, hasMore: false },
    });

    const { wrapper } = await mountView();

    const card = wrapper.find("[data-testid='my-work-up-next-FEAT-9']");
    expect(card.exists()).toBe(true);
    expect(card.attributes("data-reason")).toBe("overdue");
  });

  it("ranks overdue ahead of critical-priority in Up next", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    getTasks.mockResolvedValue({
      data: [
        task({ id: "t-crit", displayId: "FEAT-7", priority: "critical" }),
        task({ id: "t-overdue", displayId: "FEAT-8", dueDate: yesterday }),
      ],
      pagination: { cursor: null, hasMore: false },
    });

    const { wrapper } = await mountView();

    const cards = wrapper.findAll("[data-testid^='my-work-up-next-']");
    expect(cards[0].attributes("data-testid")).toBe("my-work-up-next-FEAT-8");
    expect(cards[1].attributes("data-testid")).toBe("my-work-up-next-FEAT-7");
  });

  it("project filter narrows the status groups but does not affect Up next", async () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const projA = {
      id: "p-a",
      key: "AAA",
      name: "Project A",
      owner: HUMAN,
      color: "#3b82f6",
    };
    const projB = {
      id: "p-b",
      key: "BBB",
      name: "Project B",
      owner: HUMAN,
      color: "#10b981",
    };
    getTasks.mockResolvedValue({
      data: [
        task({ id: "t-a", displayId: "FEAT-100", projects: [projA] }),
        task({ id: "t-b", displayId: "FEAT-200", projects: [projB] }),
        task({ id: "t-overdue-b", displayId: "FEAT-300", projects: [projB], dueDate: yesterday }),
      ],
      pagination: { cursor: null, hasMore: false },
    });

    const { wrapper } = await mountView();

    await wrapper.find("[data-testid='my-work-filter-project']").setValue("p-a");

    expect(wrapper.find("[data-testid='my-work-card-FEAT-100']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='my-work-card-FEAT-200']").exists()).toBe(false);
    expect(wrapper.find("[data-testid='my-work-card-FEAT-300']").exists()).toBe(false);

    // Up next still surfaces the overdue task in Project B.
    expect(wrapper.find("[data-testid='my-work-up-next-FEAT-300']").exists()).toBe(true);
  });

  it("clicking a card navigates to the task detail route", async () => {
    getTasks.mockResolvedValue({
      data: [task({ id: "t-prog", displayId: "FEAT-3" })],
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

  it("renders an empty state with router-link links to /flows and /projects when there are no tasks", async () => {
    getTasks.mockResolvedValue({ data: [], pagination: { cursor: null, hasMore: false } });

    const { wrapper } = await mountView();

    const empty = wrapper.find("[data-testid='my-work-empty']");
    expect(empty.exists()).toBe(true);
    expect(empty.find("[data-testid='my-work-empty-flows-link']").attributes("href")).toBe("/flows");
    expect(empty.find("[data-testid='my-work-empty-projects-link']").attributes("href")).toBe("/projects");
  });

  it("clicking a card fires router.push exactly once (no double-firing)", async () => {
    getTasks.mockResolvedValue({
      data: [task({ id: "t-prog", displayId: "FEAT-3" })],
      pagination: { cursor: null, hasMore: false },
    });

    const { wrapper, router } = await mountView();
    const push = vi.spyOn(router, "push");

    await wrapper.find("[data-testid='my-work-card-FEAT-3']").trigger("click");
    await flushPromises();

    expect(push).toHaveBeenCalledTimes(1);
  });

  it("renders Project chip, Flow icon, and Stage badge as three distinct visual treatments per row (IMP-17)", async () => {
    getTasks.mockResolvedValue({
      data: [
        task({
          id: "t-x",
          displayId: "FEAT-X",
          flow: { id: "f-feature", slug: "feature", name: "Feature", icon: "sparkles" },
          currentStatus: { id: "s-design", slug: "design", name: "Design", color: "#3b82f6" },
          projects: [{ id: "p-tf", key: "TF", name: "TaskFlow", owner: HUMAN, color: "#a855f7" }],
        }),
      ],
      pagination: { cursor: null, hasMore: false },
    });

    const { wrapper } = await mountView();

    // Find the meta row inside an in-progress card (default expanded).
    const card = wrapper.find("[data-testid='my-work-card-FEAT-X']");
    const meta = card.find("[data-testid='my-work-meta']");
    expect(meta.exists()).toBe(true);
    expect(meta.find(".project-chip").text()).toBe("TF");
    expect(meta.find(".flow-icon svg").exists()).toBe(true);
    expect(meta.find(".stage-badge").text()).toBe("Design");
  });

  it("defaults to status grouping and exposes a toggle to switch to project grouping", async () => {
    getTasks.mockResolvedValue({
      data: [task({ id: "t-prog", displayId: "FEAT-3" })],
      pagination: { cursor: null, hasMore: false },
    });

    const { wrapper } = await mountView();

    expect(wrapper.find("[data-testid='my-work-group-toggle']").exists()).toBe(true);
    const statusBtn = wrapper.find("[data-testid='my-work-toggle-status']");
    const projectBtn = wrapper.find("[data-testid='my-work-toggle-project']");
    expect(statusBtn.attributes("aria-pressed")).toBe("true");
    expect(projectBtn.attributes("aria-pressed")).toBe("false");
    expect(wrapper.find("[data-testid='my-work-group-heading-in_progress']").exists()).toBe(true);
  });

  it("groups tasks by project when project mode is active, including a 'No project' group for orphans", async () => {
    const tf = { id: "p-tf", key: "TF", name: "TaskFlow", owner: HUMAN, color: "#a855f7" };
    const ops = { id: "p-ops", key: "OPS", name: "Ops", owner: HUMAN, color: "#10b981" };
    getTasks.mockResolvedValue({
      data: [
        task({ id: "t-1", displayId: "FEAT-1", projects: [tf] }),
        task({ id: "t-2", displayId: "FEAT-2", projects: [ops] }),
        task({ id: "t-3", displayId: "FEAT-3", projects: [] }),
      ],
      pagination: { cursor: null, hasMore: false },
    });

    const { wrapper } = await mountView();
    await wrapper.find("[data-testid='my-work-toggle-project']").trigger("click");

    expect(wrapper.find("[data-testid='my-work-project-group-TF']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='my-work-project-group-OPS']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='my-work-project-group-none']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='my-work-group-heading-in_progress']").exists()).toBe(false);
  });

  it("shows a multi-project task under each of its projects in project mode", async () => {
    const tf = { id: "p-tf", key: "TF", name: "TaskFlow", owner: HUMAN, color: "#a855f7" };
    const ops = { id: "p-ops", key: "OPS", name: "Ops", owner: HUMAN, color: "#10b981" };
    getTasks.mockResolvedValue({
      data: [task({ id: "t-1", displayId: "FEAT-1", projects: [tf, ops] })],
      pagination: { cursor: null, hasMore: false },
    });

    const { wrapper } = await mountView();
    await wrapper.find("[data-testid='my-work-toggle-project']").trigger("click");

    expect(wrapper.find("[data-testid='my-work-card-TF-FEAT-1']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='my-work-card-OPS-FEAT-1']").exists()).toBe(true);
  });

  it("renders a 'View all' link in the Done section for each unique flow once expanded", async () => {
    const featureDone = task({
      id: "t-done-1",
      displayId: "FEAT-9",
      resolution: "completed",
      currentStatus: { id: "s-closed", slug: "closed", name: "Closed" },
      updatedAt: new Date().toISOString(),
    });
    const bugDone = task({
      id: "t-done-2",
      displayId: "BUG-3",
      resolution: "completed",
      currentStatus: { id: "s-closed", slug: "closed", name: "Closed" },
      flow: { id: "f-bug", slug: "bug", name: "Bug" },
      updatedAt: new Date().toISOString(),
    });
    getTasks.mockResolvedValue({
      data: [featureDone, bugDone],
      pagination: { cursor: null, hasMore: false },
    });

    const { wrapper } = await mountView();
    // Done is collapsed by default — expand it to see the per-flow View all links.
    await wrapper.find("[data-testid='my-work-group-heading-done']").trigger("click");

    const featureLink = wrapper.find("[data-testid='my-work-view-all-feature']");
    const bugLink = wrapper.find("[data-testid='my-work-view-all-bug']");
    expect(featureLink.exists()).toBe(true);
    expect(bugLink.exists()).toBe(true);
    expect(featureLink.attributes("href")).toBe("/tasks/feature");
    expect(bugLink.attributes("href")).toBe("/tasks/bug");
  });
});
