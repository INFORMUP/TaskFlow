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
  { id: "f-1", slug: "bug", name: "Bug", description: "Defect resolution" },
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
