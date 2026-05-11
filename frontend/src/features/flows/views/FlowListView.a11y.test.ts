import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises, RouterLinkStub } from "@vue/test-utils";
import { axeComponent as axe } from "@/test/axe";
import FlowListView from "./FlowListView.vue";
import type { Flow } from "@/api/flows.api";

const listFlows = vi.fn();
vi.mock("@/api/flows.api", () => ({
  listFlows: (...a: unknown[]) => listFlows(...a),
}));

const FLOWS: Flow[] = [
  {
    id: "f-1",
    slug: "bug",
    name: "Bug",
    description: "Defect resolution",
    icon: null,
    stats: {
      openCount: 4,
      assignedToMeCount: 1,
      byStatus: [
        {
          status: { id: "s-triage", slug: "triage", name: "Triage", color: "#3b82f6", sortOrder: 1 },
          count: 2,
        },
        {
          status: { id: "s-investigate", slug: "investigate", name: "Investigate", color: "#f59e0b", sortOrder: 2 },
          count: 2,
        },
      ],
    },
  },
];

beforeEach(() => {
  listFlows.mockReset();
  listFlows.mockResolvedValue(FLOWS);
});

describe("Surface 2 — FlowListView a11y", () => {
  it("has no axe violations when flows are loaded", async () => {
    const wrapper = mount(FlowListView, {
      global: { stubs: { RouterLink: RouterLinkStub } },
      attachTo: document.body,
    });
    await flushPromises();
    expect(await axe(wrapper.element)).toHaveNoViolations();
    wrapper.unmount();
  });
});
