import { describe, it, expect } from "vitest";
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
