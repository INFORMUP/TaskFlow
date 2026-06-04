import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ProjectSignoffPoliciesSection from "./ProjectSignoffPoliciesSection.vue";

const listPolicies = vi.fn();
const createPolicy = vi.fn();
const deletePolicy = vi.fn();
const addPolicySlot = vi.fn();
const deletePolicySlot = vi.fn();
const setProjectDefaultPolicy = vi.fn();
const getProject = vi.fn();

vi.mock("@/api/signoff-policies.api", () => ({
  listPolicies: (...a: unknown[]) => listPolicies(...a),
  createPolicy: (...a: unknown[]) => createPolicy(...a),
  deletePolicy: (...a: unknown[]) => deletePolicy(...a),
  addPolicySlot: (...a: unknown[]) => addPolicySlot(...a),
  deletePolicySlot: (...a: unknown[]) => deletePolicySlot(...a),
  setProjectDefaultPolicy: (...a: unknown[]) => setProjectDefaultPolicy(...a),
}));

vi.mock("@/api/projects.api", () => ({
  getProject: (...a: unknown[]) => getProject(...a),
}));

const POLICY_A = {
  id: "pol-a",
  orgId: "org-1",
  projectId: "proj-1",
  slug: "three-eyes",
  name: "3-eyes",
  description: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  slots: [
    { id: "slot-x", policyId: "pol-a", ordinal: 1, label: "Implementer", requiredActorType: "human", requiredUserId: null },
    { id: "slot-y", policyId: "pol-a", ordinal: 2, label: "Reviewer", requiredActorType: null, requiredUserId: null },
  ],
};

const POLICY_B = {
  id: "pol-b",
  orgId: "org-1",
  projectId: null,
  slug: "agent-review",
  name: "Agent review",
  description: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  slots: [],
};

const PROJECT = {
  id: "proj-1",
  key: "TF",
  name: "TaskFlow",
  owner: { id: "u1", displayName: "Alice", actorType: "human" },
  defaultAssignee: null,
  defaultFlow: null,
  teams: [],
  color: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  archivedAt: null,
  defaultSignoffPolicyId: "pol-a",
};

beforeEach(() => {
  listPolicies.mockReset();
  createPolicy.mockReset();
  deletePolicy.mockReset();
  addPolicySlot.mockReset();
  deletePolicySlot.mockReset();
  setProjectDefaultPolicy.mockReset();
  getProject.mockReset();

  listPolicies.mockResolvedValue([POLICY_A, POLICY_B]);
  getProject.mockResolvedValue(PROJECT);
  setProjectDefaultPolicy.mockResolvedValue(undefined);
  deletePolicy.mockResolvedValue(undefined);
  addPolicySlot.mockResolvedValue({ id: "slot-new", policyId: "pol-b", ordinal: 1, label: "QA", requiredActorType: "human", requiredUserId: null });
  deletePolicySlot.mockResolvedValue(undefined);
});

describe("ProjectSignoffPoliciesSection", () => {
  it("loads and renders policy names", async () => {
    const wrapper = mount(ProjectSignoffPoliciesSection, { props: { projectId: "proj-1" } });
    await flushPromises();

    expect(listPolicies).toHaveBeenCalledWith();
    expect(getProject).toHaveBeenCalledWith("proj-1");
    expect(wrapper.text()).toContain("3-eyes");
    expect(wrapper.text()).toContain("Agent review");
  });

  it("shows empty state when no policies", async () => {
    listPolicies.mockResolvedValueOnce([]);
    getProject.mockResolvedValueOnce({ ...PROJECT, defaultSignoffPolicyId: null });
    const wrapper = mount(ProjectSignoffPoliciesSection, { props: { projectId: "proj-1" } });
    await flushPromises();

    expect(wrapper.find("[data-testid='no-policies']").exists()).toBe(true);
  });

  it("shows default badge on the current project-default policy", async () => {
    const wrapper = mount(ProjectSignoffPoliciesSection, { props: { projectId: "proj-1" } });
    await flushPromises();

    expect(wrapper.find("[data-testid='default-badge-pol-a']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='default-badge-pol-b']").exists()).toBe(false);
  });

  it("shows Set default button only on non-default policies", async () => {
    const wrapper = mount(ProjectSignoffPoliciesSection, { props: { projectId: "proj-1" } });
    await flushPromises();

    expect(wrapper.find("[data-testid='set-default-btn-pol-a']").exists()).toBe(false);
    expect(wrapper.find("[data-testid='set-default-btn-pol-b']").exists()).toBe(true);
  });

  it("calls setProjectDefaultPolicy when Set default is clicked", async () => {
    const wrapper = mount(ProjectSignoffPoliciesSection, { props: { projectId: "proj-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='set-default-btn-pol-b']").trigger("click");
    await flushPromises();

    expect(setProjectDefaultPolicy).toHaveBeenCalledWith("proj-1", "pol-b");
  });

  it("calls setProjectDefaultPolicy with null when Clear default is clicked", async () => {
    const wrapper = mount(ProjectSignoffPoliciesSection, { props: { projectId: "proj-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='clear-default-btn']").trigger("click");
    await flushPromises();

    expect(setProjectDefaultPolicy).toHaveBeenCalledWith("proj-1", null);
  });

  it("shows clear-default button only when a default is set", async () => {
    getProject.mockResolvedValueOnce({ ...PROJECT, defaultSignoffPolicyId: null });
    const wrapper = mount(ProjectSignoffPoliciesSection, { props: { projectId: "proj-1" } });
    await flushPromises();

    expect(wrapper.find("[data-testid='clear-default-btn']").exists()).toBe(false);
  });

  it("calls deletePolicy and reloads on delete click", async () => {
    listPolicies.mockResolvedValueOnce([POLICY_A, POLICY_B]).mockResolvedValueOnce([POLICY_B]);
    getProject.mockResolvedValue(PROJECT);
    const wrapper = mount(ProjectSignoffPoliciesSection, { props: { projectId: "proj-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='delete-policy-btn-pol-a']").trigger("click");
    await flushPromises();

    expect(deletePolicy).toHaveBeenCalledWith("pol-a");
    expect(listPolicies).toHaveBeenCalledTimes(2);
  });

  it("shows and submits create form", async () => {
    createPolicy.mockResolvedValue({ ...POLICY_B, id: "pol-new", name: "My policy" });
    listPolicies.mockResolvedValueOnce([POLICY_A, POLICY_B]).mockResolvedValueOnce([POLICY_A, POLICY_B]);
    const wrapper = mount(ProjectSignoffPoliciesSection, { props: { projectId: "proj-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='create-policy-btn']").trigger("click");
    await wrapper.get("[data-testid='new-policy-name']").setValue("My policy");
    await wrapper.get("[data-testid='create-submit-btn']").trigger("click");
    await flushPromises();

    expect(createPolicy).toHaveBeenCalledWith(
      expect.objectContaining({ name: "My policy", projectId: "proj-1" })
    );
  });

  it("adds a slot to a policy when manage-slots form is submitted", async () => {
    listPolicies.mockResolvedValueOnce([POLICY_A, POLICY_B]).mockResolvedValueOnce([POLICY_A, POLICY_B]);
    const wrapper = mount(ProjectSignoffPoliciesSection, { props: { projectId: "proj-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='manage-slots-btn-pol-b']").trigger("click");
    await wrapper.get("[data-testid='add-slot-label-pol-b']").setValue("QA");
    await wrapper.get("[data-testid='add-slot-submit-pol-b']").trigger("click");
    await flushPromises();

    expect(addPolicySlot).toHaveBeenCalledWith("pol-b", expect.objectContaining({ label: "QA" }));
  });

  it("removes a slot when delete slot button is clicked", async () => {
    listPolicies.mockResolvedValueOnce([POLICY_A, POLICY_B]).mockResolvedValueOnce([POLICY_A, POLICY_B]);
    const wrapper = mount(ProjectSignoffPoliciesSection, { props: { projectId: "proj-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='manage-slots-btn-pol-a']").trigger("click");
    await wrapper.get("[data-testid='remove-slot-btn-slot-x']").trigger("click");
    await flushPromises();

    expect(deletePolicySlot).toHaveBeenCalledWith("pol-a", "slot-x");
  });

  it("renders slot labels and actor types", async () => {
    const wrapper = mount(ProjectSignoffPoliciesSection, { props: { projectId: "proj-1" } });
    await flushPromises();

    expect(wrapper.text()).toContain("Implementer");
    expect(wrapper.text()).toContain("human");
    expect(wrapper.text()).toContain("Reviewer");
  });
});
