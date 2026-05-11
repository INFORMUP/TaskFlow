import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises, RouterLinkStub } from "@vue/test-utils";
import FlowListView from "./FlowListView.vue";
import type { Flow, FlowStatusBreakdownEntry } from "@/api/flows.api";

const listFlows = vi.fn();

vi.mock("@/api/flows.api", () => ({
  listFlows: (...a: unknown[]) => listFlows(...a),
}));

function entry(
  slug: string,
  name: string,
  count: number,
  sortOrder: number,
  color: string | null = "#aaaaaa",
): FlowStatusBreakdownEntry {
  return {
    status: { id: `s-${slug}`, slug, name, color, sortOrder },
    count,
  };
}

const FLOWS: Flow[] = [
  {
    id: "f-1",
    slug: "bug",
    name: "Bug",
    description: "Defect resolution",
    icon: null,
    stats: {
      openCount: 5,
      assignedToMeCount: 2,
      byStatus: [
        entry("triage", "Triage", 2, 1, "#3b82f6"),
        entry("investigate", "Investigate", 2, 2, "#f59e0b"),
        entry("approve", "Approve", 0, 3, "#f59e0b"),
        entry("resolve", "Resolve", 1, 4, "#f59e0b"),
        entry("validate", "Validate", 0, 5, "#14b8a6"),
      ],
    },
  },
  {
    id: "f-2",
    slug: "feature",
    name: "Feature",
    description: "New functionality",
    icon: null,
    stats: {
      openCount: 0,
      assignedToMeCount: 0,
      byStatus: [
        entry("discuss", "Discuss", 0, 1),
        entry("design", "Design", 0, 2),
      ],
    },
  },
  {
    id: "f-3",
    slug: "improvement",
    name: "Improvement",
    description: null,
    icon: null,
    stats: {
      openCount: 3,
      assignedToMeCount: 0,
      byStatus: [
        entry("propose", "Propose", 3, 1, "#3b82f6"),
        entry("approve", "Approve", 0, 2, "#f59e0b"),
      ],
    },
  },
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
  it("renders a card for each flow", async () => {
    const wrapper = await mountView();
    for (const flow of FLOWS) {
      expect(wrapper.find(`[data-testid='flow-card-${flow.slug}']`).exists()).toBe(true);
    }
  });

  it("displays flow name, slug, and description in each card", async () => {
    const wrapper = await mountView();
    const card = wrapper.get("[data-testid='flow-card-bug']");
    expect(card.text()).toContain("Bug");
    expect(card.text()).toContain("bug");
    expect(card.text()).toContain("Defect resolution");
  });

  it("omits description when null", async () => {
    const wrapper = await mountView();
    const card = wrapper.get("[data-testid='flow-card-improvement']");
    expect(card.find(".flow-card__description").exists()).toBe(false);
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

  it("renders open count and assigned-to-me count per flow", async () => {
    const wrapper = await mountView();
    const card = wrapper.get("[data-testid='flow-card-bug']");
    expect(card.get("[data-testid='flow-open-count-bug']").text()).toContain("5");
    expect(card.get("[data-testid='flow-mine-count-bug']").text()).toContain("2");
  });

  it("renders zero counts and an empty-state breakdown when openCount is 0", async () => {
    const wrapper = await mountView();
    const card = wrapper.get("[data-testid='flow-card-feature']");
    expect(card.get("[data-testid='flow-open-count-feature']").text()).toContain("0");
    expect(card.get("[data-testid='flow-mine-count-feature']").text()).toContain("0");
    expect(card.find("[data-testid='flow-empty-feature']").exists()).toBe(true);
    expect(card.find("[data-testid='flow-bar-feature']").exists()).toBe(false);
  });

  it("shows empty state when no flows exist", async () => {
    listFlows.mockResolvedValue([]);
    const wrapper = await mountView();
    expect(wrapper.text()).toContain("No flows");
  });

  it("renders one bar segment per non-empty status in sortOrder, colored by status.color", async () => {
    const wrapper = await mountView();
    const bar = wrapper.get("[data-testid='flow-bar-bug']");
    const segments = bar.findAll("[data-testid^='flow-segment-bug-']");
    // Non-empty statuses for bug: triage, investigate, resolve (3 total)
    expect(segments.length).toBe(3);
    expect(segments[0].attributes("data-testid")).toBe("flow-segment-bug-triage");
    expect(segments[1].attributes("data-testid")).toBe("flow-segment-bug-investigate");
    expect(segments[2].attributes("data-testid")).toBe("flow-segment-bug-resolve");
    // Color sourced from status.color
    expect(segments[0].attributes("style") ?? "").toContain("#3b82f6");
    // Tooltip carries name and count
    expect(segments[0].attributes("title")).toBe("Triage: 2");
  });

  it("renders one chip per non-empty status, hiding zero-count statuses", async () => {
    const wrapper = await mountView();
    const card = wrapper.get("[data-testid='flow-card-bug']");
    expect(card.find("[data-testid='flow-chip-bug-triage']").exists()).toBe(true);
    expect(card.find("[data-testid='flow-chip-bug-investigate']").exists()).toBe(true);
    expect(card.find("[data-testid='flow-chip-bug-resolve']").exists()).toBe(true);
    // Zero-count statuses are not rendered as chips
    expect(card.find("[data-testid='flow-chip-bug-approve']").exists()).toBe(false);
    expect(card.find("[data-testid='flow-chip-bug-validate']").exists()).toBe(false);
    // Chip text combines count + name
    expect(card.find("[data-testid='flow-chip-bug-triage']").text()).toContain("2");
    expect(card.find("[data-testid='flow-chip-bug-triage']").text()).toContain("Triage");
  });

  it("hides the stacked bar from assistive tech and labels the breakdown region", async () => {
    const wrapper = await mountView();
    const bar = wrapper.get("[data-testid='flow-bar-bug']");
    expect(bar.attributes("aria-hidden")).toBe("true");
    const region = wrapper.get("[data-testid='flow-breakdown-bug']");
    const label = region.attributes("aria-label") ?? "";
    expect(label).toContain("2 in Triage");
    expect(label).toContain("2 in Investigate");
    expect(label).toContain("1 in Resolve");
  });
});

