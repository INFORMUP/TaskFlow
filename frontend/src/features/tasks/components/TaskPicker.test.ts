import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import TaskPicker from "./TaskPicker.vue";

const getTasks = vi.fn();

vi.mock("@/api/tasks.api", () => ({
  getTasks: (...a: unknown[]) => getTasks(...a),
}));

const TASK_A = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  displayId: "FEAT-1",
  title: "Alpha task",
  flow: { slug: "feature", name: "Feature" },
  currentStatus: { slug: "discuss", name: "Discuss" },
};
const TASK_B = {
  id: "bbbbbbbb-0000-0000-0000-000000000002",
  displayId: "FEAT-2",
  title: "Beta task",
  flow: { slug: "feature", name: "Feature" },
  currentStatus: { slug: "design", name: "Design" },
};
const TASK_SELF = {
  id: "cccccccc-0000-0000-0000-000000000003",
  displayId: "FEAT-3",
  title: "Self task",
  flow: { slug: "feature", name: "Feature" },
  currentStatus: { slug: "implement", name: "Implement" },
};

beforeEach(() => {
  getTasks.mockReset();
  getTasks.mockResolvedValue({
    data: [TASK_A, TASK_B, TASK_SELF],
    pagination: { cursor: null, hasMore: false },
  });
});

describe("TaskPicker", () => {
  it("loads candidates on mount and excludes the excludeId task", async () => {
    const wrapper = mount(TaskPicker, { props: { excludeId: TASK_SELF.id } });
    await flushPromises();

    expect(getTasks).toHaveBeenCalled();
    const text = wrapper.text();
    expect(text).toContain("FEAT-1");
    expect(text).toContain("Alpha task");
    expect(text).toContain("FEAT-2");
    expect(text).not.toContain("Self task");
  });

  it("emits select with the task id when an option is clicked", async () => {
    const wrapper = mount(TaskPicker, { props: { excludeId: null } });
    await flushPromises();

    const option = wrapper
      .findAll(".picker__option")
      .find((o) => o.text().includes("Alpha task"))!;
    await option.trigger("click");

    expect(wrapper.emitted("select")).toBeTruthy();
    expect(wrapper.emitted("select")![0]).toEqual([TASK_A.id]);
  });

  it("narrows the list as the filter input changes", async () => {
    const wrapper = mount(TaskPicker, { props: { excludeId: null } });
    await flushPromises();

    await wrapper.find(".picker__filter").setValue("Beta");
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain("Beta task");
    expect(text).not.toContain("Alpha task");
  });

  it("emits close on Escape", async () => {
    const wrapper = mount(TaskPicker, { props: { excludeId: null }, attachTo: document.body });
    await flushPromises();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(wrapper.emitted("close")).toBeTruthy();
  });
});
