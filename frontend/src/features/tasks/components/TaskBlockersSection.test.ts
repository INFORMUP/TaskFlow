import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import TaskBlockersSection from "./TaskBlockersSection.vue";

const getTaskBlockers = vi.fn();
const addTaskBlocker = vi.fn();
const removeTaskBlocker = vi.fn();
const getTasks = vi.fn();

vi.mock("@/api/tasks.api", () => ({
  getTaskBlockers: (...a: unknown[]) => getTaskBlockers(...a),
  addTaskBlocker: (...a: unknown[]) => addTaskBlocker(...a),
  removeTaskBlocker: (...a: unknown[]) => removeTaskBlocker(...a),
  getTasks: (...a: unknown[]) => getTasks(...a),
}));

const BLOCKER = {
  id: "11111111-1111-1111-1111-111111111111",
  displayId: "FEAT-2",
  title: "Auth refactor",
  flow: { slug: "feature", name: "Feature" },
  currentStatus: { slug: "implement", name: "Implement" },
};

const BLOCKING = {
  id: "22222222-2222-2222-2222-222222222222",
  displayId: "FEAT-9",
  title: "Downstream consumer",
  flow: { slug: "feature", name: "Feature" },
  currentStatus: { slug: "discuss", name: "Discuss" },
};

beforeEach(() => {
  getTaskBlockers.mockReset();
  addTaskBlocker.mockReset();
  removeTaskBlocker.mockReset();
  getTasks.mockReset();
  getTaskBlockers.mockResolvedValue({ blockers: [BLOCKER], blocking: [BLOCKING] });
  addTaskBlocker.mockResolvedValue({ blocker: BLOCKER });
  removeTaskBlocker.mockResolvedValue(undefined);
  getTasks.mockResolvedValue({ data: [], pagination: { cursor: null, hasMore: false } });
});

describe("TaskBlockersSection", () => {
  it("renders existing blockers and blocking tasks", async () => {
    const wrapper = mount(TaskBlockersSection, { props: { taskId: "t-1" } });
    await flushPromises();

    expect(getTaskBlockers).toHaveBeenCalledWith("t-1");
    expect(wrapper.text()).toContain("FEAT-2");
    expect(wrapper.text()).toContain("Auth refactor");
    expect(wrapper.text()).toContain("FEAT-9");
    expect(wrapper.text()).toContain("Downstream consumer");
  });

  it("shows empty-state copy when there are no blockers", async () => {
    getTaskBlockers.mockResolvedValueOnce({ blockers: [], blocking: [] });
    const wrapper = mount(TaskBlockersSection, { props: { taskId: "t-1" } });
    await flushPromises();
    expect(wrapper.text()).toContain("No blockers.");
  });

  it("resolves a displayId via getTasks and calls addTaskBlocker with the task UUID", async () => {
    getTasks.mockResolvedValueOnce({
      data: [{ ...BLOCKER }],
      pagination: { cursor: null, hasMore: false },
    });
    const wrapper = mount(TaskBlockersSection, { props: { taskId: "t-1" } });
    await flushPromises();

    const input = wrapper.get('[data-testid="blocker-input"]');
    await input.setValue("FEAT-2");
    await wrapper.get('[data-testid="blocker-add-button"]').trigger("click");
    await flushPromises();

    expect(getTasks).toHaveBeenCalledWith({ q: "FEAT-2" });
    expect(addTaskBlocker).toHaveBeenCalledWith("t-1", BLOCKER.id);
  });

  it("passes a UUID directly to addTaskBlocker without searching", async () => {
    const wrapper = mount(TaskBlockersSection, { props: { taskId: "t-1" } });
    await flushPromises();

    const uuid = "33333333-3333-3333-3333-333333333333";
    await wrapper.get('[data-testid="blocker-input"]').setValue(uuid);
    await wrapper.get('[data-testid="blocker-add-button"]').trigger("click");
    await flushPromises();

    expect(getTasks).not.toHaveBeenCalled();
    expect(addTaskBlocker).toHaveBeenCalledWith("t-1", uuid);
  });

  it("removes a blocker on click", async () => {
    const wrapper = mount(TaskBlockersSection, { props: { taskId: "t-1" } });
    await flushPromises();

    await wrapper.get(`[data-testid="blocker-remove-${BLOCKER.id}"]`).trigger("click");
    await flushPromises();

    expect(removeTaskBlocker).toHaveBeenCalledWith("t-1", BLOCKER.id);
  });

  it("surfaces server error messages", async () => {
    addTaskBlocker.mockRejectedValueOnce({
      error: { code: "CYCLIC_BLOCKER", message: "Adding this blocker would create a direct cycle" },
    });
    const wrapper = mount(TaskBlockersSection, { props: { taskId: "t-1" } });
    await flushPromises();

    await wrapper.get('[data-testid="blocker-input"]').setValue("00000000-0000-0000-0000-000000000999");
    await wrapper.get('[data-testid="blocker-add-button"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("Adding this blocker would create a direct cycle");
  });
});
