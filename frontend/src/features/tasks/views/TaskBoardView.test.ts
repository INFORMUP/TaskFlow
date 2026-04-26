import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import TaskBoardView from "./TaskBoardView.vue";
import type { Task } from "@/api/tasks.api";

const getTasks = vi.fn();
const updateTask = vi.fn();
const createTransition = vi.fn();
const apiFetch = vi.fn();

vi.mock("@/api/tasks.api", () => ({
  getTasks: (...a: unknown[]) => getTasks(...a),
  updateTask: (...a: unknown[]) => updateTask(...a),
}));
vi.mock("@/api/transitions.api", () => ({
  createTransition: (...a: unknown[]) => createTransition(...a),
}));
vi.mock("@/api/client", () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
}));
vi.mock("@/composables/useOnboardingTour", () => ({
  useOnboardingTour: () => ({ hasCompletedTour: { value: true }, startTour: vi.fn() }),
}));
vi.mock("@/composables/useCurrentUser", () => ({
  useCurrentUser: () => ({ needsTeamSelection: { value: false } }),
}));

const ALICE = { id: "u-1", displayName: "Alice", actorType: "human" };
const BOB = { id: "u-2", displayName: "Bob", actorType: "human" };

function taskFixture(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    displayId: "FEAT-1",
    title: "Original title",
    description: null,
    priority: "medium",
    resolution: null,
    dueDate: null,
    flow: { id: "f-1", slug: "feature", name: "Feature" },
    currentStatus: { id: "s-1", slug: "discuss", name: "Discuss" },
    creator: ALICE,
    assignee: ALICE,
    projects: [],
    createdAt: "2026-04-10T10:00:00.000Z",
    updatedAt: "2026-04-10T10:00:00.000Z",
    ...overrides,
  };
}

function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/tasks/:flow", name: "tasks", component: { template: "<div />" } },
      { path: "/tasks/:flow/:id", name: "task-detail", component: { template: "<div />" } },
    ],
  });
  return router;
}

async function mountBoard() {
  const router = makeRouter();
  await router.push("/tasks/feature");
  await router.isReady();
  const wrapper = mount(TaskBoardView, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  getTasks.mockReset();
  updateTask.mockReset();
  createTransition.mockReset();
  apiFetch.mockReset();
  apiFetch.mockImplementation((url: string) => {
    if (url === "/api/v1/teams") return Promise.resolve({ data: [] });
    if (url === "/api/v1/users") return Promise.resolve({ data: [ALICE, BOB] });
    return Promise.resolve({ data: [] });
  });
});

describe("TaskBoardView — inline interactions", () => {
  it("posts a transition when a card is dropped on a different status column", async () => {
    getTasks.mockResolvedValue({ data: [taskFixture()], pagination: { cursor: null, hasMore: false } });
    createTransition.mockResolvedValue({ success: true });

    const { wrapper } = await mountBoard();
    const cards = wrapper.findAll('[role="button"][draggable="true"]');
    expect(cards.length).toBeGreaterThan(0);

    const dataMap = new Map<string, string>();
    const dataTransfer = {
      setData: (k: string, v: string) => void dataMap.set(k, v),
      getData: (k: string) => dataMap.get(k) ?? "",
      effectAllowed: "",
      dropEffect: "",
    };

    await cards[0].trigger("dragstart", { dataTransfer });
    await flushPromises();

    const columns = wrapper.findAll(".column");
    const designColumn = columns.find((c) => c.text().includes("Design"));
    expect(designColumn).toBeTruthy();

    await designColumn!.trigger("dragover", { dataTransfer });
    await designColumn!.trigger("drop", { dataTransfer });
    await flushPromises();

    expect(createTransition).toHaveBeenCalledWith("t-1", { toStatus: "design", note: "Moved via board" });
  });

  it("rolls back and shows an error banner when the transition fails", async () => {
    getTasks.mockResolvedValue({ data: [taskFixture()], pagination: { cursor: null, hasMore: false } });
    createTransition.mockRejectedValue({ error: { code: "INVALID_TRANSITION", message: "Not allowed from here" } });

    const { wrapper } = await mountBoard();
    const cards = wrapper.findAll('[role="button"][draggable="true"]');
    const dataMap = new Map<string, string>();
    const dataTransfer = {
      setData: (k: string, v: string) => void dataMap.set(k, v),
      getData: (k: string) => dataMap.get(k) ?? "",
      effectAllowed: "",
      dropEffect: "",
    };

    await cards[0].trigger("dragstart", { dataTransfer });
    const designColumn = wrapper.findAll(".column").find((c) => c.text().includes("Design"))!;
    await designColumn.trigger("dragover", { dataTransfer });
    await designColumn.trigger("drop", { dataTransfer });
    await flushPromises();

    const banner = wrapper.find('[data-testid="board-error-banner"]');
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain("Not allowed from here");
  });

  it("commits an inline title edit via PATCH on Enter", async () => {
    getTasks.mockResolvedValue({ data: [taskFixture()], pagination: { cursor: null, hasMore: false } });
    updateTask.mockResolvedValue(taskFixture({ title: "New title" }));

    const { wrapper } = await mountBoard();
    const titleEl = wrapper.find(".card__title");
    await titleEl.trigger("dblclick");
    await flushPromises();

    const input = wrapper.find<HTMLInputElement>(".card__title-input");
    expect(input.exists()).toBe(true);
    await input.setValue("New title");
    await input.trigger("keydown.enter");
    await flushPromises();

    expect(updateTask).toHaveBeenCalledWith("t-1", { title: "New title" });
  });

  it("cancels inline title edit on Escape without calling the API", async () => {
    getTasks.mockResolvedValue({ data: [taskFixture()], pagination: { cursor: null, hasMore: false } });

    const { wrapper } = await mountBoard();
    await wrapper.find(".card__title").trigger("dblclick");
    await flushPromises();

    const input = wrapper.find<HTMLInputElement>(".card__title-input");
    await input.setValue("Should not commit");
    await input.trigger("keydown.escape");
    await flushPromises();

    expect(updateTask).not.toHaveBeenCalled();
    expect(wrapper.find(".card__title-input").exists()).toBe(false);
    expect(wrapper.find(".card__title").text()).toBe("Original title");
  });

  it("reassigns via PATCH when an assignee is picked", async () => {
    getTasks.mockResolvedValue({ data: [taskFixture()], pagination: { cursor: null, hasMore: false } });
    updateTask.mockResolvedValue(taskFixture({ assignee: BOB }));

    const { wrapper } = await mountBoard();
    await wrapper.find(".card__assignee-btn").trigger("click");
    await flushPromises();

    const options = wrapper.findAll(".picker__option");
    const bobOption = options.find((o) => o.text().includes("Bob"));
    expect(bobOption).toBeTruthy();
    await bobOption!.trigger("click");
    await flushPromises();

    expect(updateTask).toHaveBeenCalledWith("t-1", { assigneeUserId: "u-2" });
  });
});
