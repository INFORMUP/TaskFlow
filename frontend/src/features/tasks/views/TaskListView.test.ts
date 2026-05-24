import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import TaskListView from "./TaskListView.vue";
import type { Task } from "@/api/tasks.api";

const ALICE = { id: "u-1", displayName: "Alice", actorType: "human" };

function taskFixture(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    displayId: "FEAT-1",
    title: "Sample task",
    description: null,
    priority: "medium",
    resolution: null,
    dueDate: null,
    flow: { id: "f-1", slug: "feature", name: "Feature" },
    currentStatus: { id: "s-1", slug: "discuss", name: "Discuss" },
    creator: ALICE,
    assignee: ALICE,
    projects: [],
    labels: [],
    createdAt: "2026-04-10T10:00:00.000Z",
    updatedAt: "2026-04-10T10:00:00.000Z",
    ...overrides,
  };
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/tasks/:flow", component: { template: "<div />" } },
      { path: "/tasks/:flow/:id", component: { template: "<div />" } },
    ],
  });
}

async function mountList(tasks: Task[]) {
  const router = makeRouter();
  await router.push("/tasks/feature");
  await router.isReady();
  return mount(TaskListView, {
    props: { tasks, flow: "feature" },
    global: { plugins: [router] },
  });
}

describe("TaskListView — assignee reassignment", () => {
  it("emits request-assignee-pick when the assignee cell is clicked", async () => {
    const task = taskFixture();
    const wrapper = await mountList([task]);
    const btn = wrapper.find("[data-testid='list-assignee-btn']");
    expect(btn.exists()).toBe(true);
    await btn.trigger("click");
    const emitted = wrapper.emitted("request-assignee-pick");
    expect(emitted).toBeTruthy();
    expect(emitted![0][0]).toEqual(task);
    expect(emitted![0][1]).toBe(btn.element);
  });

  it("renders an actionable assignee cell even when no assignee is set", async () => {
    const task = taskFixture({ assignee: null });
    const wrapper = await mountList([task]);
    const btn = wrapper.find("[data-testid='list-assignee-btn']");
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toContain("Unassigned");
    await btn.trigger("click");
    expect(wrapper.emitted("request-assignee-pick")).toBeTruthy();
  });
});

describe("TaskListView — cross-flow (showFlow)", () => {
  it("renders a Flow column and routes each row to its own flow", async () => {
    const router = makeRouter();
    await router.push("/tasks/feature");
    await router.isReady();
    const push = vi.spyOn(router, "push");
    const tasks = [
      taskFixture({ id: "a", displayId: "FEAT-1", flow: { id: "f1", slug: "feature", name: "Feature" } }),
      taskFixture({ id: "b", displayId: "BUG-2", flow: { id: "f2", slug: "bug", name: "Bug" } }),
    ];
    const wrapper = mount(TaskListView, {
      props: { tasks, showFlow: true },
      global: { plugins: [router] },
    });

    const headers = wrapper.findAll("th").map((h) => h.text());
    expect(headers).toContain("Flow");
    expect(wrapper.text()).toContain("Feature");
    expect(wrapper.text()).toContain("Bug");

    const idButtons = wrapper.findAll(".task-list__row-btn");
    await idButtons[1].trigger("click");
    expect(push).toHaveBeenCalledWith("/tasks/bug/b");
  });

  it("omits the Flow column by default", async () => {
    const wrapper = await mountList([taskFixture()]);
    const headers = wrapper.findAll("th").map((h) => h.text());
    expect(headers).not.toContain("Flow");
  });
});
