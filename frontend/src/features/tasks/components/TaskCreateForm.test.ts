import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import TaskCreateForm from "./TaskCreateForm.vue";

const createTask = vi.fn();
const listProjects = vi.fn();
const listProjectFlows = vi.fn();
const listFlows = vi.fn();
const listFlowStatuses = vi.fn();
const listLabels = vi.fn();
const attachLabelToTask = vi.fn();
const createTransition = vi.fn();
const listOrgMembers = vi.fn();
const apiFetch = vi.fn();

const getTasks = vi.fn();
vi.mock("@/api/tasks.api", () => ({
  createTask: (...a: unknown[]) => createTask(...a),
  getTasks: (...a: unknown[]) => getTasks(...a),
}));
vi.mock("@/api/projects.api", () => ({
  listProjects: (...a: unknown[]) => listProjects(...a),
  listProjectFlows: (...a: unknown[]) => listProjectFlows(...a),
}));
vi.mock("@/api/flows.api", () => ({
  listFlows: (...a: unknown[]) => listFlows(...a),
  listFlowStatuses: (...a: unknown[]) => listFlowStatuses(...a),
}));
vi.mock("@/api/labels.api", () => ({
  listLabels: (...a: unknown[]) => listLabels(...a),
  attachLabelToTask: (...a: unknown[]) => attachLabelToTask(...a),
}));
vi.mock("@/api/transitions.api", () => ({
  createTransition: (...a: unknown[]) => createTransition(...a),
}));
vi.mock("@/api/org-members.api", () => ({
  listOrgMembers: (...a: unknown[]) => listOrgMembers(...a),
}));
vi.mock("@/api/client", () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
}));

const ALICE = { id: "u-1", displayName: "Alice", actorType: "human" };
const FEATURE_FLOW = { id: "f-1", slug: "feature", name: "Feature", isDefault: true };
const BUG_FLOW = { id: "f-2", slug: "bug", name: "Bug", isDefault: false };

const PROJECT = {
  id: "p-1",
  key: "TF",
  name: "TaskFlow",
  defaultAssignee: ALICE,
};

const FEATURE_STATUSES = [
  { id: "s-1", slug: "discuss", name: "Discuss", description: null, sortOrder: 0 },
  { id: "s-2", slug: "design", name: "Design", description: null, sortOrder: 1 },
  { id: "s-3", slug: "implement", name: "Implement", description: null, sortOrder: 2 },
];

const LABEL_BUG = { id: "l-1", name: "bug", color: "#ff0000", createdAt: "2026-01-01" };
const LABEL_UX = { id: "l-2", name: "ux", color: "#00ff00", createdAt: "2026-01-01" };

beforeEach(() => {
  createTask.mockReset();
  listProjects.mockReset();
  listProjectFlows.mockReset();
  listFlows.mockReset();
  listFlowStatuses.mockReset();
  listLabels.mockReset();
  attachLabelToTask.mockReset();
  createTransition.mockReset();
  listOrgMembers.mockReset();
  apiFetch.mockReset();
  getTasks.mockReset();
  getTasks.mockResolvedValue({ data: [], pagination: { cursor: null, hasMore: false } });

  listProjects.mockResolvedValue([PROJECT]);
  listProjectFlows.mockResolvedValue([FEATURE_FLOW, BUG_FLOW]);
  listFlows.mockResolvedValue([FEATURE_FLOW, BUG_FLOW]);
  listFlowStatuses.mockResolvedValue(FEATURE_STATUSES);
  listLabels.mockResolvedValue([LABEL_BUG, LABEL_UX]);
  attachLabelToTask.mockResolvedValue(undefined);
  createTransition.mockResolvedValue({ success: true });
  listOrgMembers.mockResolvedValue([ALICE]);
  apiFetch.mockResolvedValue({ data: [] });
  createTask.mockResolvedValue({
    id: "t-99",
    displayId: "TF-1",
    title: "New",
    flow: { id: "f-1", slug: "feature", name: "Feature" },
    currentStatus: { id: "s-1", slug: "discuss", name: "Discuss" },
  });
});

async function mountForm(props: { flow?: string; parentId?: string } = {}) {
  const wrapper = mount(TaskCreateForm, { props });
  await flushPromises();
  return wrapper;
}

async function pickFirstProject(wrapper: ReturnType<typeof mount>) {
  const checkbox = wrapper.get('input[type="checkbox"]');
  await checkbox.setValue(true);
  await flushPromises();
}

describe("TaskCreateForm — initial status selection", () => {
  it("renders a status select populated with the chosen flow's statuses, defaulting to the first by sortOrder", async () => {
    const wrapper = await mountForm({ flow: "feature" });
    await pickFirstProject(wrapper);

    const select = wrapper.get('select[data-testid="task-create-status"]');
    const options = select.findAll("option").map((o) => ({
      value: o.attributes("value"),
      text: o.text(),
    }));
    expect(options.map((o) => o.value)).toEqual(["discuss", "design", "implement"]);
    expect((select.element as HTMLSelectElement).value).toBe("discuss");
  });

  it("transitions the task after creation when the user picks a non-default initial status", async () => {
    const wrapper = await mountForm({ flow: "feature" });
    await pickFirstProject(wrapper);

    await wrapper.get('input[placeholder="Title"]').setValue("Make it nice");
    await wrapper.get('select[data-testid="task-create-status"]').setValue("design");
    await wrapper.get(".create-form__submit").trigger("click");
    await flushPromises();

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTransition).toHaveBeenCalledWith(
      "t-99",
      expect.objectContaining({ toStatus: "design" }),
    );
  });

  it("does NOT transition when the selected status equals the flow default", async () => {
    const wrapper = await mountForm({ flow: "feature" });
    await pickFirstProject(wrapper);

    await wrapper.get('input[placeholder="Title"]').setValue("Default landing");
    await wrapper.get(".create-form__submit").trigger("click");
    await flushPromises();

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTransition).not.toHaveBeenCalled();
  });
});

describe("TaskCreateForm — labels (tags) selection", () => {
  it("renders the available labels as checkable options", async () => {
    const wrapper = await mountForm({ flow: "feature" });
    await pickFirstProject(wrapper);

    const labelArea = wrapper.get('[data-testid="task-create-labels"]');
    expect(labelArea.text()).toContain("bug");
    expect(labelArea.text()).toContain("ux");
  });

  it("attaches each selected label after creating the task", async () => {
    const wrapper = await mountForm({ flow: "feature" });
    await pickFirstProject(wrapper);

    await wrapper.get('input[placeholder="Title"]').setValue("Tagged task");
    const labelBoxes = wrapper
      .get('[data-testid="task-create-labels"]')
      .findAll('input[type="checkbox"]');
    await labelBoxes[0].setValue(true);
    await labelBoxes[1].setValue(true);

    await wrapper.get(".create-form__submit").trigger("click");
    await flushPromises();

    expect(attachLabelToTask).toHaveBeenCalledTimes(2);
    expect(attachLabelToTask).toHaveBeenCalledWith("t-99", "l-1");
    expect(attachLabelToTask).toHaveBeenCalledWith("t-99", "l-2");
  });

  it("skips label attachment when no labels are selected", async () => {
    const wrapper = await mountForm({ flow: "feature" });
    await pickFirstProject(wrapper);

    await wrapper.get('input[placeholder="Title"]').setValue("No tags");
    await wrapper.get(".create-form__submit").trigger("click");
    await flushPromises();

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(attachLabelToTask).not.toHaveBeenCalled();
  });
});

describe("TaskCreateForm — no preset flow", () => {
  it("renders without a flow prop and loads available flows once a project is picked", async () => {
    const wrapper = await mountForm();
    await pickFirstProject(wrapper);

    const flowSelect = wrapper.get(".create-form__select");
    const options = flowSelect.findAll("option").map((o) => o.attributes("value"));
    expect(options).toContain("feature");
    expect(options).toContain("bug");
  });
});

describe("TaskCreateForm — assignee picker (BUG-18)", () => {
  it("populates the assignee dropdown from listOrgMembers, so org Owners (who 403 on /api/v1/users) can still pick assignees", async () => {
    const BOB = { id: "u-2", displayName: "Bob", actorType: "human" };
    listOrgMembers.mockResolvedValue([ALICE, BOB]);
    apiFetch.mockRejectedValue(
      Object.assign(new Error("Forbidden"), { status: 403 }),
    );

    const wrapper = await mountForm({ flow: "feature" });
    await pickFirstProject(wrapper);

    const select = wrapper.get('select[data-testid="task-create-assignee"]');
    const optionTexts = select.findAll("option").map((o) => o.text());
    expect(optionTexts).toContain("Alice");
    expect(optionTexts).toContain("Bob");
  });
});

describe("TaskCreateForm — parent (spawned-from) selection (FEAT-116)", () => {
  const PARENT = {
    id: "parent-uuid-0000",
    displayId: "FEAT-50",
    title: "Big epic",
    flow: { slug: "feature", name: "Feature" },
    currentStatus: { slug: "discuss", name: "Discuss" },
  };

  it("passes the parentId prop as spawnedFromTaskId to createTask on submit", async () => {
    const wrapper = await mountForm({ flow: "feature", parentId: "parent-uuid-0000" });
    await pickFirstProject(wrapper);

    await wrapper.get('input[placeholder="Title"]').setValue("Child of epic");
    await wrapper.get(".create-form__submit").trigger("click");
    await flushPromises();

    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask.mock.calls[0][0]).toMatchObject({
      spawnedFromTaskId: "parent-uuid-0000",
    });
  });

  it("lets the user pick a parent via the picker, which is then submitted", async () => {
    getTasks.mockResolvedValue({
      data: [PARENT],
      pagination: { cursor: null, hasMore: false },
    });
    const wrapper = await mountForm({ flow: "feature" });
    await pickFirstProject(wrapper);

    await wrapper.get('input[placeholder="Title"]').setValue("Picked parent");
    await wrapper.get('[data-testid="task-create-parent-btn"]').trigger("click");
    await flushPromises();
    const option = wrapper
      .findAll(".picker__option")
      .find((o) => o.text().includes("Big epic"))!;
    expect(option).toBeTruthy();
    await option.trigger("click");
    await flushPromises();

    await wrapper.get(".create-form__submit").trigger("click");
    await flushPromises();

    expect(createTask.mock.calls[0][0]).toMatchObject({
      spawnedFromTaskId: "parent-uuid-0000",
    });
  });
});

describe("TaskCreateForm — created event payload", () => {
  it("emits `created` with the new task so parents can navigate", async () => {
    const wrapper = await mountForm({ flow: "feature" });
    await pickFirstProject(wrapper);

    await wrapper.get('input[placeholder="Title"]').setValue("Carry me");
    await wrapper.get(".create-form__submit").trigger("click");
    await flushPromises();

    const events = wrapper.emitted("created");
    expect(events).toBeTruthy();
    expect(events![0][0]).toMatchObject({ id: "t-99", flow: { slug: "feature" } });
  });
});
