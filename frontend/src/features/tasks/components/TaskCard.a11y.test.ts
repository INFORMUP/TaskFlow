import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import { axeComponent as axe } from "@/test/axe";
import TaskCard from "./TaskCard.vue";
import ViewToggle from "./ViewToggle.vue";
import type { Task } from "@/api/tasks.api";

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/tasks/:flow", name: "tasks", component: { template: "<div />" } }],
  });
}

const task: Task = {
  id: "00000000-0000-0000-0000-000000000001",
  displayId: "BUG-1",
  title: "A thing is broken",
  description: null,
  priority: "high",
  dueDate: null,
  createdAt: "2026-04-20T00:00:00.000Z",
  updatedAt: "2026-04-20T00:00:00.000Z",
  resolution: null,
  flow: { id: "f", slug: "bug", name: "Bug" },
  currentStatus: { id: "s", slug: "triage", name: "Triage" },
  projects: [],
  creator: { id: "u", displayName: "Alice", actorType: "human" },
  assignee: { id: "u", displayName: "Alice", actorType: "human" },
} as unknown as Task;

describe("Surface 1 — TaskCard / ViewToggle a11y", () => {
  it("TaskCard has no axe violations", async () => {
    const wrapper = mount(TaskCard, { props: { task } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });

  it("ViewToggle has no axe violations", async () => {
    const router = makeRouter();
    await router.push("/tasks/bug");
    const wrapper = mount(ViewToggle, { global: { plugins: [router] } });
    expect(await axe(wrapper.element)).toHaveNoViolations();
  });
});
