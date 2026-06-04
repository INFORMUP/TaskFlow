import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import DefaultPolicySection from "./DefaultPolicySection.vue";

const getTask = vi.fn();
const listPolicies = vi.fn();
const createPolicy = vi.fn();
const addPolicySlot = vi.fn();
const setTaskDefaultPolicy = vi.fn();
const deletePolicy = vi.fn();

vi.mock("@/api/tasks.api", () => ({
  getTask: (...a: unknown[]) => getTask(...a),
}));

vi.mock("@/api/signoff-policies.api", () => ({
  listPolicies: (...a: unknown[]) => listPolicies(...a),
  createPolicy: (...a: unknown[]) => createPolicy(...a),
  addPolicySlot: (...a: unknown[]) => addPolicySlot(...a),
  setTaskDefaultPolicy: (...a: unknown[]) => setTaskDefaultPolicy(...a),
  deletePolicy: (...a: unknown[]) => deletePolicy(...a),
}));

const POLICY_A = {
  id: "pol-a",
  orgId: "org-1",
  projectId: null,
  slug: "three-eyes",
  name: "3-eyes",
  description: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  slots: [
    { id: "ps-1", policyId: "pol-a", ordinal: 1, label: "Implementer", requiredActorType: "human", requiredUserId: null },
    { id: "ps-2", policyId: "pol-a", ordinal: 2, label: "Agent review", requiredActorType: "agent", requiredUserId: null },
  ],
};

const POLICY_B = {
  id: "pol-b",
  orgId: "org-1",
  projectId: null,
  slug: "two-eyes",
  name: "2-eyes",
  description: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  slots: [
    { id: "ps-3", policyId: "pol-b", ordinal: 1, label: "Reviewer", requiredActorType: null, requiredUserId: null },
  ],
};

const TASK_WITH_POLICY = {
  id: "task-1",
  defaultSignoffPolicyId: "pol-a",
};

const TASK_NO_POLICY = {
  id: "task-1",
  defaultSignoffPolicyId: null,
};

beforeEach(() => {
  getTask.mockReset();
  listPolicies.mockReset();
  createPolicy.mockReset();
  addPolicySlot.mockReset();
  setTaskDefaultPolicy.mockReset();
  deletePolicy.mockReset();
  listPolicies.mockResolvedValue([POLICY_A, POLICY_B]);
  setTaskDefaultPolicy.mockResolvedValue(undefined);
  createPolicy.mockResolvedValue({ ...POLICY_A, id: "pol-new" });
  addPolicySlot.mockResolvedValue({});
});

describe("DefaultPolicySection", () => {
  it("shows 'none' state when task has no default policy", async () => {
    getTask.mockResolvedValue(TASK_NO_POLICY);
    const wrapper = mount(DefaultPolicySection, { props: { taskId: "task-1" } });
    await flushPromises();
    expect(wrapper.text()).toContain("None");
    expect(wrapper.find("[data-testid='current-policy-name']").exists()).toBe(false);
  });

  it("shows current policy name and slots when policy is set", async () => {
    getTask.mockResolvedValue(TASK_WITH_POLICY);
    const wrapper = mount(DefaultPolicySection, { props: { taskId: "task-1" } });
    await flushPromises();
    expect(wrapper.find("[data-testid='current-policy-name']").text()).toBe("3-eyes");
    expect(wrapper.text()).toContain("Implementer");
    expect(wrapper.text()).toContain("Agent review");
  });

  it("shows Set button when no policy, Change+Clear when policy is set", async () => {
    getTask.mockResolvedValue(TASK_NO_POLICY);
    const wrapper = mount(DefaultPolicySection, { props: { taskId: "task-1" } });
    await flushPromises();
    expect(wrapper.find("[data-testid='set-policy-btn']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='clear-policy-btn']").exists()).toBe(false);

    getTask.mockResolvedValue(TASK_WITH_POLICY);
    const wrapper2 = mount(DefaultPolicySection, { props: { taskId: "task-1" } });
    await flushPromises();
    expect(wrapper2.find("[data-testid='change-policy-btn']").exists()).toBe(true);
    expect(wrapper2.find("[data-testid='clear-policy-btn']").exists()).toBe(true);
  });

  it("opens picker on Set/Change and lists available policies", async () => {
    getTask.mockResolvedValue(TASK_NO_POLICY);
    const wrapper = mount(DefaultPolicySection, { props: { taskId: "task-1" } });
    await flushPromises();
    await wrapper.get("[data-testid='set-policy-btn']").trigger("click");
    expect(wrapper.find("[data-testid='policy-picker']").exists()).toBe(true);
    expect(wrapper.text()).toContain("3-eyes");
    expect(wrapper.text()).toContain("2-eyes");
  });

  it("applies a selected existing policy", async () => {
    getTask.mockResolvedValue(TASK_NO_POLICY).mockResolvedValueOnce(TASK_NO_POLICY).mockResolvedValueOnce({ ...TASK_NO_POLICY, defaultSignoffPolicyId: "pol-b" });
    const wrapper = mount(DefaultPolicySection, { props: { taskId: "task-1" } });
    await flushPromises();
    await wrapper.get("[data-testid='set-policy-btn']").trigger("click");

    const select = wrapper.get("[data-testid='policy-select']");
    await select.setValue("pol-b");
    await wrapper.get("[data-testid='apply-policy-btn']").trigger("click");
    await flushPromises();

    expect(setTaskDefaultPolicy).toHaveBeenCalledWith("task-1", "pol-b");
  });

  it("clears the task default policy", async () => {
    getTask.mockResolvedValue(TASK_WITH_POLICY);
    const wrapper = mount(DefaultPolicySection, { props: { taskId: "task-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='clear-policy-btn']").trigger("click");
    await flushPromises();

    expect(setTaskDefaultPolicy).toHaveBeenCalledWith("task-1", null);
  });

  it("can create a new policy and apply it as task default", async () => {
    getTask.mockResolvedValue(TASK_NO_POLICY);
    const newPol = { ...POLICY_A, id: "pol-new", slug: "new-policy", name: "My Policy" };
    createPolicy.mockResolvedValue(newPol);
    addPolicySlot.mockResolvedValue({});
    getTask.mockResolvedValueOnce(TASK_NO_POLICY).mockResolvedValueOnce({ ...TASK_NO_POLICY, defaultSignoffPolicyId: "pol-new" });
    listPolicies.mockResolvedValueOnce([POLICY_A, POLICY_B]).mockResolvedValueOnce([...([POLICY_A, POLICY_B]), newPol]);

    const wrapper = mount(DefaultPolicySection, { props: { taskId: "task-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='set-policy-btn']").trigger("click");
    await wrapper.get("[data-testid='create-policy-btn']").trigger("click");

    await wrapper.get("[data-testid='new-policy-name']").setValue("My Policy");
    await wrapper.get("[data-testid='add-slot-row-btn']").trigger("click");
    await wrapper.get("[data-testid='slot-label-0']").setValue("Implementer");
    await wrapper.get("[data-testid='slot-actor-0']").setValue("human");

    await wrapper.get("[data-testid='create-apply-btn']").trigger("click");
    await flushPromises();

    expect(createPolicy).toHaveBeenCalledWith(
      expect.objectContaining({ name: "My Policy" })
    );
    expect(addPolicySlot).toHaveBeenCalledWith(
      "pol-new",
      expect.objectContaining({ label: "Implementer", requiredActorType: "human" })
    );
    expect(setTaskDefaultPolicy).toHaveBeenCalledWith("task-1", "pol-new");
  });
});
