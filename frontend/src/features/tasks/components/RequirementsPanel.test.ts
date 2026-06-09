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
const uploadRequirementImage = vi.fn();
const deleteRequirementImage = vi.fn();
const getImageBlobUrl = vi.fn();

vi.mock("@/api/requirements.api", () => ({
  getRequirements: (...a: unknown[]) => getRequirements(...a),
  createRequirement: (...a: unknown[]) => createRequirement(...a),
  updateRequirement: (...a: unknown[]) => updateRequirement(...a),
  deleteRequirement: (...a: unknown[]) => deleteRequirement(...a),
  createSlot: (...a: unknown[]) => createSlot(...a),
  deleteSlot: (...a: unknown[]) => deleteSlot(...a),
  createAttestation: (...a: unknown[]) => createAttestation(...a),
  uploadRequirementImage: (...a: unknown[]) => uploadRequirementImage(...a),
  deleteRequirementImage: (...a: unknown[]) => deleteRequirementImage(...a),
  getImageBlobUrl: (...a: unknown[]) => getImageBlobUrl(...a),
}));

const listOrgMembers = vi.fn();
vi.mock("@/api/org-members.api", () => ({
  listOrgMembers: (...a: unknown[]) => listOrgMembers(...a),
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
      comment: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

const REQ_A = {
  id: "req-a",
  parentId: null,
  number: "1",
  ordinal: 1,
  statement: "Must display requirements list",
  rationale: "Core feature",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  slots: [SLOT_HUMAN, SLOT_AGENT],
  quorum: { verified: false, signed: 0, total: 2, missing: ["Implementer sign-off", "Agent review"], notDistinct: false },
  images: [],
};

const REQ_B = {
  id: "req-b",
  parentId: null,
  number: "2",
  ordinal: 2,
  statement: "Must allow human sign-off",
  rationale: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  slots: [SLOT_ANY],
  quorum: { verified: true, signed: 1, total: 1, missing: [], notDistinct: false },
  images: [],
};

const REQ_DISTINCT = {
  id: "req-c",
  parentId: null,
  number: "3",
  ordinal: 3,
  statement: "Self-review case",
  rationale: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  slots: [SLOT_ANY],
  quorum: { verified: false, signed: 0, total: 1, missing: [], notDistinct: true },
  images: [],
};

const REQ_A_CHILD = {
  id: "req-a1",
  parentId: "req-a",
  number: "1.1",
  ordinal: 1,
  statement: "Sub-requirement of A",
  rationale: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  slots: [],
  quorum: { verified: false, signed: 0, total: 0, missing: [], notDistinct: false },
  images: [],
};

const IMAGE_META = {
  id: "img-1",
  filename: "diagram.png",
  mimeType: "image/png",
  size: 1024,
  createdAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  getRequirements.mockReset();
  createRequirement.mockReset();
  updateRequirement.mockReset();
  deleteRequirement.mockReset();
  createSlot.mockReset();
  deleteSlot.mockReset();
  createAttestation.mockReset();
  uploadRequirementImage.mockReset();
  deleteRequirementImage.mockReset();
  getImageBlobUrl.mockReset();
  listOrgMembers.mockReset();
  getRequirements.mockResolvedValue([REQ_A, REQ_B]);
  listOrgMembers.mockResolvedValue([
    { id: "user-1", displayName: "Ada Lovelace", actorType: "human" },
  ]);
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
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    expect(wrapper.find("[data-testid='signoff-btn-slot-3']").exists()).toBe(false);
    expect(wrapper.find("[data-testid='cancel-signoff-btn-slot-3']").exists()).toBe(true);
  });

  it("shows attestation form with not_met placeholder on cancel sign-off click", async () => {
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='cancel-signoff-btn-slot-3']").trigger("click");

    expect(wrapper.find("[data-testid='attest-form-slot-3']").exists()).toBe(true);
    const placeholder = wrapper.find("[data-testid='attest-comment-slot-3']").attributes("placeholder");
    expect(placeholder).toContain("still needs to be done");
  });

  it("calls createAttestation with not_met on cancel sign-off confirm", async () => {
    createAttestation.mockResolvedValue({
      id: "att-cancel",
      actorId: "u1",
      actorType: "human",
      verdict: "not_met",
      evidence: null,
      comment: null,
      createdAt: "2026-01-01T00:00:00Z",
    });

    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='cancel-signoff-btn-slot-3']").trigger("click");
    await wrapper.get("[data-testid='attest-submit-slot-3']").trigger("click");
    await flushPromises();

    expect(createAttestation).toHaveBeenCalledWith("task-1", "req-b", "slot-3", { verdict: "not_met" });
  });

  it("passes comment to createAttestation when provided on cancel", async () => {
    createAttestation.mockResolvedValue({
      id: "att-cancel",
      actorId: "u1",
      actorType: "human",
      verdict: "not_met",
      evidence: null,
      comment: "Missing test coverage",
      createdAt: "2026-01-01T00:00:00Z",
    });

    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='cancel-signoff-btn-slot-3']").trigger("click");
    await wrapper.get("[data-testid='attest-comment-slot-3']").setValue("Missing test coverage");
    await wrapper.get("[data-testid='attest-submit-slot-3']").trigger("click");
    await flushPromises();

    expect(createAttestation).toHaveBeenCalledWith("task-1", "req-b", "slot-3", {
      verdict: "not_met",
      comment: "Missing test coverage",
    });
  });

  it("dismiss button closes the attestation form without submitting", async () => {
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='cancel-signoff-btn-slot-3']").trigger("click");
    expect(wrapper.find("[data-testid='attest-form-slot-3']").exists()).toBe(true);

    await wrapper.get("[data-testid='attest-cancel-slot-3']").trigger("click");
    expect(wrapper.find("[data-testid='attest-form-slot-3']").exists()).toBe(false);
    expect(createAttestation).not.toHaveBeenCalled();
  });

  it("shows agent-only badge for agent slots", async () => {
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();
    expect(wrapper.find("[data-testid='agent-only-slot-2']").exists()).toBe(true);
  });

  it("shows attestation form on sign-off click", async () => {
    getRequirements.mockResolvedValue([REQ_A]);
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='signoff-btn-slot-1']").trigger("click");

    expect(wrapper.find("[data-testid='attest-form-slot-1']").exists()).toBe(true);
    const placeholder = wrapper.find("[data-testid='attest-comment-slot-1']").attributes("placeholder");
    expect(placeholder).toContain("note");
  });

  it("calls createAttestation with met verdict on sign-off confirm", async () => {
    getRequirements.mockResolvedValue([REQ_A]);
    createAttestation.mockResolvedValue({
      id: "att-new",
      actorId: "u1",
      actorType: "human",
      verdict: "met",
      evidence: null,
      comment: null,
      createdAt: "2026-01-01T00:00:00Z",
    });

    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='signoff-btn-slot-1']").trigger("click");
    await wrapper.get("[data-testid='attest-submit-slot-1']").trigger("click");
    await flushPromises();

    expect(createAttestation).toHaveBeenCalledWith("task-1", "req-a", "slot-1", { verdict: "met" });
  });

  // ── Comment surfacing (history-aware) ────────────────────────────────────────

  const SLOT_WITH_HISTORY = {
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
        verdict: "not_met",
        evidence: null,
        comment: "Missing test coverage",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "att-2",
        actorId: "user-1",
        actorType: "human",
        verdict: "met",
        evidence: null,
        comment: "Tests added, signing off",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
    ],
  };

  it("shows a comment-count chip with the number of commented attestations", async () => {
    getRequirements.mockResolvedValueOnce([{ ...REQ_B, slots: [SLOT_WITH_HISTORY] }]);
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    const chip = wrapper.find("[data-testid='comment-count-slot-3']");
    expect(chip.exists()).toBe(true);
    expect(chip.text()).toContain("2");
  });

  it("does not show a comment-count chip when no attestation has a comment", async () => {
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    expect(wrapper.find("[data-testid='comment-count-slot-3']").exists()).toBe(false);
  });

  it("keeps the comment thread collapsed until the chip is clicked", async () => {
    getRequirements.mockResolvedValueOnce([{ ...REQ_B, slots: [SLOT_WITH_HISTORY] }]);
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    expect(wrapper.find("[data-testid='attest-thread-slot-3']").exists()).toBe(false);

    await wrapper.get("[data-testid='comment-count-slot-3']").trigger("click");
    expect(wrapper.find("[data-testid='attest-thread-slot-3']").exists()).toBe(true);
  });

  it("renders every commented attestation in the thread, newest first", async () => {
    getRequirements.mockResolvedValueOnce([{ ...REQ_B, slots: [SLOT_WITH_HISTORY] }]);
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='comment-count-slot-3']").trigger("click");
    const entries = wrapper.findAll("[data-testid^='attest-entry-slot-3-']");
    expect(entries).toHaveLength(2);
    // newest first
    expect(entries[0].text()).toContain("Tests added, signing off");
    expect(entries[1].text()).toContain("Missing test coverage");
  });

  it("resolves the attester display name to initials in the thread", async () => {
    getRequirements.mockResolvedValueOnce([{ ...REQ_B, slots: [SLOT_WITH_HISTORY] }]);
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='comment-count-slot-3']").trigger("click");
    expect(wrapper.find("[data-testid='attest-thread-slot-3']").text()).toContain("AL");
  });

  // ── "Not met" button for pending slots ───────────────────────────────────────

  it("shows not-met button for a pending human slot", async () => {
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    expect(wrapper.find("[data-testid='not-met-btn-slot-1']").exists()).toBe(true);
  });

  it("does not show not-met button for an agent-only slot", async () => {
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    expect(wrapper.find("[data-testid='not-met-btn-slot-2']").exists()).toBe(false);
  });

  it("does not show not-met button when slot is already met (cancel sign-off shown instead)", async () => {
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    expect(wrapper.find("[data-testid='not-met-btn-slot-3']").exists()).toBe(false);
    expect(wrapper.find("[data-testid='cancel-signoff-btn-slot-3']").exists()).toBe(true);
  });

  it("does not show not-met button when slot is already not_met", async () => {
    const notMetSlot = {
      ...SLOT_HUMAN,
      attestations: [
        {
          id: "att-nm",
          actorId: "user-1",
          actorType: "human",
          verdict: "not_met",
          evidence: null,
          comment: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    getRequirements.mockResolvedValueOnce([{ ...REQ_A, slots: [notMetSlot] }]);
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    expect(wrapper.find("[data-testid='not-met-btn-slot-1']").exists()).toBe(false);
    expect(wrapper.find("[data-testid='signoff-btn-slot-1']").exists()).toBe(true);
  });

  it("shows attestation form with not_met placeholder on not-met click", async () => {
    getRequirements.mockResolvedValue([REQ_A]);
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='not-met-btn-slot-1']").trigger("click");

    expect(wrapper.find("[data-testid='attest-form-slot-1']").exists()).toBe(true);
    const placeholder = wrapper.find("[data-testid='attest-comment-slot-1']").attributes("placeholder");
    expect(placeholder).toContain("still needs to be done");
  });

  it("calls createAttestation with not_met verdict on not-met confirm", async () => {
    getRequirements.mockResolvedValue([REQ_A]);
    createAttestation.mockResolvedValue({
      id: "att-nm",
      actorId: "u1",
      actorType: "human",
      verdict: "not_met",
      evidence: null,
      comment: null,
      createdAt: "2026-01-01T00:00:00Z",
    });

    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='not-met-btn-slot-1']").trigger("click");
    await wrapper.get("[data-testid='attest-submit-slot-1']").trigger("click");
    await flushPromises();

    expect(createAttestation).toHaveBeenCalledWith("task-1", "req-a", "slot-1", { verdict: "not_met" });
  });

  // ── State-forward styling ─────────────────────────────────────────────────────

  it("marks a signed-off slot row with the met state class", async () => {
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();
    expect(wrapper.find("[data-testid='slot-row-slot-3']").classes()).toContain("req-panel__slot--met");
  });

  it("marks a not-met slot row with the not-met state class", async () => {
    const notMetSlot = {
      ...SLOT_ANY,
      attestations: [{ ...SLOT_ANY.attestations[0], verdict: "not_met" }],
    };
    getRequirements.mockResolvedValueOnce([{ ...REQ_B, slots: [notMetSlot] }]);
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();
    expect(wrapper.find("[data-testid='slot-row-slot-3']").classes()).toContain("req-panel__slot--not-met");
  });

  it("marks an unattested slot row with the pending state class", async () => {
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();
    expect(wrapper.find("[data-testid='slot-row-slot-1']").classes()).toContain("req-panel__slot--pending");
  });

  it("shows attester initials on a slot row that has a latest attestation", async () => {
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();
    expect(wrapper.find("[data-testid='attester-slot-3']").text()).toBe("AL");
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

  // ── Nesting tests ──────────────────────────────────────────────────────────

  it("displays hierarchical numbers as prefixes", async () => {
    getRequirements.mockResolvedValueOnce([REQ_A, REQ_A_CHILD, REQ_B]);
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    expect(wrapper.find("[data-testid='req-number-req-a']").text()).toBe("1");
    expect(wrapper.find("[data-testid='req-number-req-a1']").text()).toBe("1.1");
    expect(wrapper.find("[data-testid='req-number-req-b']").text()).toBe("2");
  });

  it("indents child requirements visually", async () => {
    getRequirements.mockResolvedValueOnce([REQ_A, REQ_A_CHILD]);
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    const childRow = wrapper.find("[data-testid='req-row-req-a1']");
    expect(childRow.attributes("data-depth")).toBe("2");
  });

  it("shows add-child button on each requirement", async () => {
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    expect(wrapper.find("[data-testid='add-child-btn-req-a']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='add-child-btn-req-b']").exists()).toBe(true);
  });

  it("creates a child requirement with parentId when add-child form is submitted", async () => {
    createRequirement.mockResolvedValue({ ...REQ_A_CHILD });
    getRequirements.mockResolvedValueOnce([REQ_A]).mockResolvedValueOnce([REQ_A, REQ_A_CHILD]);

    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='add-child-btn-req-a']").trigger("click");
    await wrapper.get("[data-testid='child-req-statement-req-a']").setValue("Sub-requirement of A");
    await wrapper.get("[data-testid='child-req-submit-req-a']").trigger("click");
    await flushPromises();

    expect(createRequirement).toHaveBeenCalledWith(
      "task-1",
      { statement: "Sub-requirement of A", parentId: "req-a" }
    );
  });

  it("closes add-child form on cancel", async () => {
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='add-child-btn-req-a']").trigger("click");
    expect(wrapper.find("[data-testid='child-req-statement-req-a']").exists()).toBe(true);

    await wrapper.get("[data-testid='child-req-cancel-req-a']").trigger("click");
    expect(wrapper.find("[data-testid='child-req-statement-req-a']").exists()).toBe(false);
  });

  // ── Image tests ────────────────────────────────────────────────────────────

  it("shows image thumbnails for requirements that have images", async () => {
    getRequirements.mockResolvedValueOnce([{ ...REQ_A, images: [IMAGE_META] }, REQ_B]);
    getImageBlobUrl.mockResolvedValue("blob:fake-url");
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    expect(getImageBlobUrl).toHaveBeenCalledWith("img-1");
    expect(wrapper.find("[data-testid='req-image-img-1']").exists()).toBe(true);
  });

  it("shows upload-image button on each requirement", async () => {
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    expect(wrapper.find("[data-testid='upload-image-btn-req-a']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='upload-image-btn-req-b']").exists()).toBe(true);
  });

  it("calls uploadRequirementImage and refreshes when a file is selected", async () => {
    uploadRequirementImage.mockResolvedValue(IMAGE_META);
    getRequirements.mockResolvedValueOnce([REQ_A, REQ_B]).mockResolvedValueOnce([
      { ...REQ_A, images: [IMAGE_META] },
      REQ_B,
    ]);
    getImageBlobUrl.mockResolvedValue("blob:fake-url");

    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    const input = wrapper.find("[data-testid='image-file-input-req-a']");
    expect(input.exists()).toBe(true);

    const file = new File(["data"], "test.png", { type: "image/png" });
    Object.defineProperty(input.element, "files", { value: [file] });
    await input.trigger("change");
    await flushPromises();

    expect(uploadRequirementImage).toHaveBeenCalledWith("task-1", "req-a", file);
  });

  // ── Evidence image button guard ──────────────────────────────────────────────

  it("hides evidence button when attestation evidence is a plain text string (not a UUID)", async () => {
    const slotWithTextEvidence = {
      id: "slot-1",
      ordinal: 1,
      label: "Agent",
      requiredActorType: "agent",
      requiredUserId: null,
      attestations: [
        {
          id: "att-text",
          actorId: "u1",
          actorType: "human",
          verdict: "met",
          evidence: "QuestionBlock.vue diff: border-radius:50% confirmed",
          comment: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    getRequirements.mockResolvedValueOnce([{ ...REQ_A, slots: [slotWithTextEvidence] }]);
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    expect(wrapper.find("[data-testid='evidence-btn-slot-1']").exists()).toBe(false);
  });

  it("shows evidence button when attestation evidence is a valid UUID", async () => {
    const IMAGE_UUID = "3f6c2e1a-4b5d-4e7f-8a9b-0c1d2e3f4a5b";
    getImageBlobUrl.mockResolvedValue("blob:fake-evidence");
    const slotWithImageEvidence = {
      id: "slot-1",
      ordinal: 1,
      label: "Agent",
      requiredActorType: "agent",
      requiredUserId: null,
      attestations: [
        {
          id: "att-img",
          actorId: "u1",
          actorType: "human",
          verdict: "met",
          evidence: IMAGE_UUID,
          comment: null,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };
    getRequirements.mockResolvedValueOnce([{ ...REQ_A, slots: [slotWithImageEvidence] }]);
    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    expect(wrapper.find("[data-testid='evidence-btn-slot-1']").exists()).toBe(true);
  });

  it("calls deleteRequirementImage and refreshes on delete image click", async () => {
    getRequirements.mockResolvedValueOnce([{ ...REQ_A, images: [IMAGE_META] }, REQ_B]);
    getImageBlobUrl.mockResolvedValue("blob:fake-url");
    deleteRequirementImage.mockResolvedValue(undefined);
    getRequirements.mockResolvedValueOnce([REQ_A, REQ_B]);

    const wrapper = mount(RequirementsPanel, { props: { taskId: "task-1" } });
    await flushPromises();

    await wrapper.get("[data-testid='delete-image-img-1']").trigger("click");
    await flushPromises();

    expect(deleteRequirementImage).toHaveBeenCalledWith("task-1", "req-a", "img-1");
  });
});
