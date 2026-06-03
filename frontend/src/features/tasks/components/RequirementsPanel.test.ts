import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import RequirementsPanel from "./RequirementsPanel.vue";

const getRequirements = vi.fn();
const createRequirement = vi.fn();
const updateRequirement = vi.fn();
const deleteRequirement = vi.fn();
const createSlot = vi.fn();
const deleteSlot = vi.fn();
const createAttestation = vi.fn();

vi.mock("@/api/requirements.api", () => ({
  getRequirements: (...a: unknown[]) => getRequirements(...a),
  createRequirement: (...a: unknown[]) => createRequirement(...a),
  updateRequirement: (...a: unknown[]) => updateRequirement(...a),
  deleteRequirement: (...a: unknown[]) => deleteRequirement(...a),
  createSlot: (...a: unknown[]) => createSlot(...a),
  deleteSlot: (...a: unknown[]) => deleteSlot(...a),
  createAttestation: (...a: unknown[]) => createAttestation(...a),
}));

const SLOT_HUMAN = {
  id: "slot-1",
  ordinal: 1,
  label: "Implementer sign-off",
  requiredActorType: "human",
  requiredUserId: null,
  attestations: [],
};

const SLOT_AGENT = {
  id: "slot-2",
  ordinal: 2,
  label: "Agent review",
  requiredActorType: "agent",
  requiredUserId: null,
  attestations: [],
};

const SLOT_ANY = {
  id: "slot-3",
  ordinal: 3,
  label: "Anyone",
  requiredActorType: null,
  requiredUserId: null,
  attestations: [
    {
      id: "att-1",
      actorId: "user-1",
      actorType: "human",
      verdict: "met",
      evidence: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

const REQ_A = {
  id: "req-a",
  ordinal: 1,
  statement: "Must display requirements list",
  rationale: "Core feature",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  slots: [SLOT_HUMAN, SLOT_AGENT],
  quorum: { verified: false, signed: 0, total: 2, missing: ["Implementer sign-off", "Agent review"], notDistinct: false },
};

const REQ_B = {
  id: "req-b",
  ordinal: 2,
  statement: "Must allow human sign-off",
  rationale: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  slots: [SLOT_ANY],
  quorum: { verified: true, signed: 1, total: 1, missing: [], notDistinct: false },
};

const REQ_DISTINCT = {
  id: "req-c",
  ordinal: 3,
  statement: "Self-review case",
  rationale: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  slots: [SLOT_ANY],
  quorum: { verified: false, signed: 0, total: 1, missing: [], notDistinct: true },
};

beforeEach(() => {
  getRequirements.mockReset();
  createRequirement.mockReset();
  updateRequirement.mockReset();
  deleteRequirement.mockReset();
  createSlot.mockReset();
  deleteSlot.mockReset();
  createAttestation.mockReset();
  getRequirements.mockResolvedValue([REQ_A, REQ_B]);
});

describe("RequirementsPanel", () => {
  it("loads and renders requirement statements", async () => {
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    expect(getRequirements).toHaveBeenCalledWith("task-1");
    expect(wrapper.text()).toContain("Must display requirements list");
    expect(wrapper.text()).toContain("Must allow human sign-off");
  });

  it("shows rationale when present", async () => {
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();
    expect(wrapper.text()).toContain("Core feature");
  });

  it("shows quorum count as m/n", async () => {
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();
    expect(wrapper.text()).toContain("0/2");
    expect(wrapper.text()).toContain("1/1");
  });

  it("shows verified class when quorum.verified is true", async () => {
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();
    const chips = wrapper.findAll("[data-testid^='quorum-chip-']");
    const verifiedChip = chips.find((c) => c.attributes("data-testid") === "quorum-chip-req-b");
    expect(verifiedChip?.classes()).toContain("quorum--verified");
  });

  it("shows notDistinct warning badge when quorum.notDistinct is true", async () => {
    getRequirements.mockResolvedValueOnce([REQ_DISTINCT]);
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();
    expect(wrapper.find("[data-testid='not-distinct-req-c']").exists()).toBe(true);
  });

  it("renders slot labels", async () => {
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();
    expect(wrapper.text()).toContain("Implementer sign-off");
    expect(wrapper.text()).toContain("Agent review");
  });

  it("shows sign-off button for unsigned human slots but not for agent-only slots", async () => {
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    const humanBtn = wrapper.find("[data-testid='signoff-btn-slot-1']");
    const agentBtn = wrapper.find("[data-testid='signoff-btn-slot-2']");

    expect(humanBtn.exists()).toBe(true);
    expect(agentBtn.exists()).toBe(false);
  });

  it("shows cancel-sign-off button instead of sign-off when slot is already signed", async () => {
    // REQ_B has SLOT_ANY which has a met attestation
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    expect(wrapper.find("[data-testid='signoff-btn-slot-3']").exists()).toBe(false);
    expect(wrapper.find("[data-testid='cancel-signoff-btn-slot-3']").exists()).toBe(true);
  });

  it("calls createAttestation with not_met on cancel sign-off", async () => {
    createAttestation.mockResolvedValue({
      id: "att-cancel",
      actorId: "u1",
      actorType: "human",
      verdict: "not_met",
      evidence: null,
      createdAt: "2026-01-01T00:00:00Z",
    });

    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='cancel-signoff-btn-slot-3']").trigger("click");
    await flushPromises();

    expect(createAttestation).toHaveBeenCalledWith("task-1", "req-b", "slot-3", { verdict: "not_met" });
  });

  it("shows agent-only badge for agent slots", async () => {
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();
    expect(wrapper.find("[data-testid='agent-only-slot-2']").exists()).toBe(true);
  });

  it("calls createAttestation with met verdict on sign-off", async () => {
    getRequirements.mockResolvedValue([REQ_A]);
    createAttestation.mockResolvedValue({
      id: "att-new",
      actorId: "u1",
      actorType: "human",
      verdict: "met",
      evidence: null,
      createdAt: "2026-01-01T00:00:00Z",
    });
    getRequirements.mockResolvedValueOnce([REQ_A]).mockResolvedValueOnce([REQ_A]);

    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='signoff-btn-slot-1']").trigger("click");
    await flushPromises();

    expect(createAttestation).toHaveBeenCalledWith("task-1", "req-a", "slot-1", { verdict: "met" });
  });

  it("deletes a requirement on button click", async () => {
    deleteRequirement.mockResolvedValue(undefined);
    getRequirements.mockResolvedValueOnce([REQ_A]).mockResolvedValueOnce([]);

    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='delete-req-req-a']").trigger("click");
    await flushPromises();

    expect(deleteRequirement).toHaveBeenCalledWith("task-1", "req-a");
  });

  it("creates a requirement from the add form", async () => {
    createRequirement.mockResolvedValue({ ...REQ_A, id: "req-new" });
    getRequirements.mockResolvedValueOnce([REQ_A]).mockResolvedValueOnce([REQ_A]);

    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='add-req-btn']").trigger("click");
    await wrapper.get("[data-testid='new-req-statement']").setValue("New requirement");
    await wrapper.get("[data-testid='new-req-submit']").trigger("click");
    await flushPromises();

    expect(createRequirement).toHaveBeenCalledWith("task-1", { statement: "New requirement" });
  });

  it("shows empty state when no requirements", async () => {
    getRequirements.mockResolvedValueOnce([]);
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();
    expect(wrapper.text()).toContain("No requirements");
  });

  it("deletes a slot", async () => {
    deleteSlot.mockResolvedValue(undefined);
    getRequirements.mockResolvedValueOnce([REQ_A]).mockResolvedValueOnce([REQ_A]);

    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='delete-slot-slot-1']").trigger("click");
    await flushPromises();

    expect(deleteSlot).toHaveBeenCalledWith("task-1", "req-a", "slot-1");
  });
});
