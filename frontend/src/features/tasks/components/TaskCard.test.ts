import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TaskCard from "./TaskCard.vue";
import type { Task } from "@/api/tasks.api";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    displayId: "FEAT-1",
    title: "Do a thing",
    description: null,
    priority: "medium",
    dueDate: null,
    createdAt: "2026-04-20T00:00:00.000Z",
    updatedAt: "2026-04-20T00:00:00.000Z",
    resolution: null,
    flow: { id: "f", slug: "feature", name: "Feature" },
    currentStatus: { id: "s", slug: "design", name: "Design" },
    projects: [],
    creator: { id: "u", displayName: "Alice", actorType: "human" },
    assignee: { id: "u", displayName: "Alice", actorType: "human" },
    ...overrides,
  } as unknown as Task;
}

describe("TaskCard project chip", () => {
  it("renders the project key when the task has one project", () => {
    const task = makeTask({
      projects: [{ id: "p1", key: "TASKFLOW", name: "Taskflow" }] as Task["projects"],
    });
    const wrapper = mount(TaskCard, { props: { task } });
    const chips = wrapper.findAll('[data-testid="project-chip"]');
    expect(chips).toHaveLength(1);
    expect(chips[0].text()).toBe("TASKFLOW");
  });

  it("renders one chip per project when the task has multiple", () => {
    const task = makeTask({
      projects: [
        { id: "p1", key: "TASKFLOW", name: "Taskflow" },
        { id: "p2", key: "REPORTAL", name: "Reportal" },
      ] as Task["projects"],
    });
    const wrapper = mount(TaskCard, { props: { task } });
    const chips = wrapper.findAll('[data-testid="project-chip"]');
    expect(chips).toHaveLength(2);
    expect(chips.map((c) => c.text())).toEqual(["TASKFLOW", "REPORTAL"]);
  });

  it("renders no project chip when the task has no projects", () => {
    const wrapper = mount(TaskCard, { props: { task: makeTask({ projects: [] }) } });
    expect(wrapper.find('[data-testid="project-chip"]').exists()).toBe(false);
  });

  it("renders no project chips when hideProjects is set, even if the task has projects", () => {
    const wrapper = mount(TaskCard, {
      props: {
        task: makeTask({
          projects: [{ id: "p1", key: "TASKFLOW", name: "Taskflow" }] as Task["projects"],
        }),
        hideProjects: true,
      },
    });
    expect(wrapper.find('[data-testid="project-chip"]').exists()).toBe(false);
  });
});
