import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises, RouterLinkStub } from "@vue/test-utils";
import FlowListView from "./FlowListView.vue";
import type { Flow } from "@/api/flows.api";

const listFlows = vi.fn();

vi.mock("@/api/flows.api", () => ({
  listFlows: (...a: unknown[]) => listFlows(...a),
}));

const FLOWS: Flow[] = [
  { id: "f-1", slug: "bug", name: "Bug", description: "Defect resolution" },
  { id: "f-2", slug: "feature", name: "Feature", description: "New functionality" },
  { id: "f-3", slug: "improvement", name: "Improvement", description: null },
];

async function mountView() {
  const wrapper = mount(FlowListView, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  listFlows.mockReset();
  listFlows.mockResolvedValue(FLOWS);
});

describe("FlowListView", () => {
  it("renders a row for each flow", async () => {
    const wrapper = await mountView();
    for (const flow of FLOWS) {
      expect(wrapper.find(`[data-testid='flow-row-${flow.slug}']`).exists()).toBe(true);
    }
  });

  it("displays flow name, slug, and description", async () => {
    const wrapper = await mountView();
    const row = wrapper.get("[data-testid='flow-row-bug']");
    expect(row.text()).toContain("Bug");
    expect(row.text()).toContain("bug");
    expect(row.text()).toContain("Defect resolution");
  });

  it("shows a dash for null descriptions", async () => {
    const wrapper = await mountView();
    const row = wrapper.get("[data-testid='flow-row-improvement']");
    expect(row.text()).toContain("—");
  });

  it("links each flow name to /tasks/:slug", async () => {
    const wrapper = await mountView();
    const link = wrapper.getComponent("[data-testid='flow-link-bug']");
    expect(link.props("to")).toBe("/tasks/bug");
  });

  it("shows loading state", async () => {
    listFlows.mockReturnValue(new Promise(() => {})); // never resolves
    const wrapper = mount(FlowListView, {
      global: { stubs: { RouterLink: RouterLinkStub } },
    });
    expect(wrapper.text()).toContain("Loading");
  });

  it("shows error state", async () => {
    listFlows.mockRejectedValue({
      error: { message: "Server error" },
    });
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("Server error");
  });

  it("shows empty state when no flows exist", async () => {
    listFlows.mockResolvedValue([]);
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("No flows");
  });
});
