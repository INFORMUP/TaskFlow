import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ProjectStatusDefaultsSection from "./ProjectStatusDefaultsSection.vue";

const listFlowStatuses = vi.fn();
const listStatusDefaults = vi.fn();
const setStatusDefault = vi.fn();
const clearStatusDefault = vi.fn();

vi.mock("@/api/flows.api", () => ({
  listFlowStatuses: (...a: unknown[]) => listFlowStatuses(...a),
}));

vi.mock("@/api/projects.api", () => ({
  listStatusDefaults: (...a: unknown[]) => listStatusDefaults(...a),
  setStatusDefault: (...a: unknown[]) => setStatusDefault(...a),
  clearStatusDefault: (...a: unknown[]) => clearStatusDefault(...a),
}));

const STATUSES = [
  { id: "st-1", slug: "triage", name: "Triage", description: null, sortOrder: 1 },
  { id: "st-2", slug: "investigate", name: "Investigate", description: null, sortOrder: 2 },
];

const USERS = [
  { id: "u-1", displayName: "Alice" },
  { id: "u-2", displayName: "Bob" },
];

beforeEach(() => {
  listFlowStatuses.mockReset();
  listStatusDefaults.mockReset();
  setStatusDefault.mockReset();
  clearStatusDefault.mockReset();

  listFlowStatuses.mockResolvedValue(STATUSES);
  listStatusDefaults.mockResolvedValue([{ flowStatusId: "st-1", userId: "u-1" }]);
  setStatusDefault.mockResolvedValue({ flowStatusId: "st-2", userId: "u-2" });
  clearStatusDefault.mockResolvedValue(undefined);
});

async function mountSection(props?: Partial<{ defaultFlowId: string | null }>) {
  const wrapper = mount(ProjectStatusDefaultsSection, {
    props: {
      projectId: "proj-1",
      defaultFlowId: "flow-1",
      users: USERS,
      ...props,
    },
  });
  await flushPromises();
  return wrapper;
}

describe("ProjectStatusDefaultsSection", () => {
  it("renders one row per flow status", async () => {
    const wrapper = await mountSection();
    for (const s of STATUSES) {
      expect(wrapper.find(`[data-testid='status-default-row-${s.slug}']`).exists()).toBe(true);
    }
  });

  it("preselects the currently configured default assignee", async () => {
    const wrapper = await mountSection();
    const select = wrapper.get<HTMLSelectElement>("[data-testid='status-default-select-triage']");
    expect(select.element.value).toBe("u-1");
  });

  it("calls setStatusDefault when a user is chosen", async () => {
    const wrapper = await mountSection();
    const select = wrapper.get("[data-testid='status-default-select-investigate']");
    await select.setValue("u-2");
    await flushPromises();
    expect(setStatusDefault).toHaveBeenCalledWith("proj-1", "st-2", "u-2");
  });

  it("calls clearStatusDefault when the empty option is chosen", async () => {
    const wrapper = await mountSection();
    const select = wrapper.get("[data-testid='status-default-select-triage']");
    await select.setValue("");
    await flushPromises();
    expect(clearStatusDefault).toHaveBeenCalledWith("proj-1", "st-1");
  });

  it("shows a prompt when no default flow is configured", async () => {
    const wrapper = await mountSection({ defaultFlowId: null });
    expect(wrapper.text()).toContain("Pick a default flow");
    expect(listFlowStatuses).not.toHaveBeenCalled();
  });
});
