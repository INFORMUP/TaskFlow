import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import VisualsSettingsView from "./VisualsSettingsView.vue";

const listProjects = vi.fn();
const updateProject = vi.fn();
const listFlows = vi.fn();
const listFlowStatuses = vi.fn();
const listFlowIcons = vi.fn();
const updateFlowIcon = vi.fn();
const updateFlowStatusColor = vi.fn();

vi.mock("@/api/projects.api", () => ({
  listProjects: (...a: unknown[]) => listProjects(...a),
  updateProject: (...a: unknown[]) => updateProject(...a),
}));
vi.mock("@/api/flows.api", () => ({
  listFlows: (...a: unknown[]) => listFlows(...a),
  listFlowStatuses: (...a: unknown[]) => listFlowStatuses(...a),
  listFlowIcons: (...a: unknown[]) => listFlowIcons(...a),
  updateFlowIcon: (...a: unknown[]) => updateFlowIcon(...a),
  updateFlowStatusColor: (...a: unknown[]) => updateFlowStatusColor(...a),
}));

const HUMAN = { id: "u-1", displayName: "Alice", actorType: "human" };

beforeEach(() => {
  listProjects.mockReset();
  updateProject.mockReset();
  listFlows.mockReset();
  listFlowStatuses.mockReset();
  listFlowIcons.mockReset();
  updateFlowIcon.mockReset();
  updateFlowStatusColor.mockReset();

  listProjects.mockResolvedValue([
    {
      id: "p-tf",
      key: "TF",
      name: "TaskFlow",
      owner: HUMAN,
      defaultAssignee: null,
      defaultFlow: null,
      teams: [],
      color: "#a855f7",
      createdAt: "2026-04-10T10:00:00.000Z",
      archivedAt: null,
    },
  ]);
  listFlows.mockResolvedValue([
    {
      id: "f-improvement",
      slug: "improvement",
      name: "Improvement",
      description: null,
      icon: "wrench",
      stats: { openCount: 0, assignedToMeCount: 0 },
    },
  ]);
  listFlowStatuses.mockResolvedValue([
    { id: "s-implement", slug: "implement", name: "Implement", description: null, sortOrder: 1, color: "#f59e0b" },
  ]);
  listFlowIcons.mockResolvedValue(["bug", "wrench", "sparkles"]);
});

describe("VisualsSettingsView", () => {
  it("renders project, flow, and stage sections", async () => {
    const wrapper = mount(VisualsSettingsView);
    await flushPromises();

    expect(wrapper.find("[data-testid='visuals-projects']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='visuals-flows']").exists()).toBe(true);
    expect(wrapper.find("[data-testid='visuals-statuses']").exists()).toBe(true);
  });

  it("calls updateProject when a project color is changed", async () => {
    updateProject.mockResolvedValue({
      id: "p-tf",
      key: "TF",
      name: "TaskFlow",
      owner: HUMAN,
      defaultAssignee: null,
      defaultFlow: null,
      teams: [],
      color: "#112233",
      createdAt: "",
      archivedAt: null,
    });

    const wrapper = mount(VisualsSettingsView);
    await flushPromises();

    const input = wrapper.find("[data-testid='project-color-TF']");
    expect(input.exists()).toBe(true);
    (input.element as HTMLInputElement).value = "#112233";
    await input.trigger("change");
    await flushPromises();

    expect(updateProject).toHaveBeenCalledWith("p-tf", { color: "#112233" });
  });

  it("calls updateFlowIcon when a flow icon is changed", async () => {
    updateFlowIcon.mockResolvedValue({
      id: "f-improvement",
      slug: "improvement",
      name: "Improvement",
      description: null,
      icon: "sparkles",
      stats: { openCount: 0, assignedToMeCount: 0 },
    });

    const wrapper = mount(VisualsSettingsView);
    await flushPromises();

    const select = wrapper.find("[data-testid='flow-icon-improvement']");
    expect(select.exists()).toBe(true);
    (select.element as HTMLSelectElement).value = "sparkles";
    await select.trigger("change");
    await flushPromises();

    expect(updateFlowIcon).toHaveBeenCalledWith("f-improvement", "sparkles");
  });

  it("calls updateFlowStatusColor when a stage color is changed", async () => {
    updateFlowStatusColor.mockResolvedValue({
      id: "s-implement",
      slug: "implement",
      name: "Implement",
      description: null,
      sortOrder: 1,
      color: "#abcdef",
    });

    const wrapper = mount(VisualsSettingsView);
    await flushPromises();

    const input = wrapper.find("[data-testid='status-color-improvement-implement']");
    expect(input.exists()).toBe(true);
    (input.element as HTMLInputElement).value = "#abcdef";
    await input.trigger("change");
    await flushPromises();

    expect(updateFlowStatusColor).toHaveBeenCalledWith("f-improvement", "s-implement", "#abcdef");
  });
});
