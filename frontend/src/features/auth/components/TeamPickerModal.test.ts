import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import TeamPickerModal from "./TeamPickerModal.vue";

const mockTeams = [
  { id: "t1", slug: "engineer", name: "Engineer", description: "Builds" },
  { id: "t2", slug: "product", name: "Product", description: "Ships" },
  { id: "t3", slug: "user", name: "User", description: "Uses" },
  { id: "t4", slug: "agent", name: "Agent", description: "Agents" },
];

vi.mock("@/api/teams.api", () => ({
  fetchTeams: vi.fn(async () => mockTeams),
}));

describe("TeamPickerModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all four teams after load", async () => {
    const wrapper = mount(TeamPickerModal, {
      props: { initialSelection: [] },
    });
    await flushPromises();

    const items = wrapper.findAll("[data-testid='team-item']");
    expect(items).toHaveLength(4);
    expect(wrapper.text()).toContain("Engineer");
    expect(wrapper.text()).toContain("Product");
    expect(wrapper.text()).toContain("User");
    expect(wrapper.text()).toContain("Agent");
  });

  it("disables submit until at least one team is selected with a primary", async () => {
    const wrapper = mount(TeamPickerModal, {
      props: { initialSelection: [] },
    });
    await flushPromises();

    const submit = wrapper.find("[data-testid='team-picker-submit']");
    expect((submit.element as HTMLButtonElement).disabled).toBe(true);
  });

  it("emits submit with selected teams and primary slug", async () => {
    const wrapper = mount(TeamPickerModal, {
      props: { initialSelection: [] },
    });
    await flushPromises();

    // Select engineer
    await wrapper.find("[data-testid='team-toggle-engineer']").setValue(true);
    // Select product
    await wrapper.find("[data-testid='team-toggle-product']").setValue(true);
    // Mark product as primary
    await wrapper.find("[data-testid='team-primary-product']").setValue(true);

    const submit = wrapper.find("[data-testid='team-picker-submit']");
    expect((submit.element as HTMLButtonElement).disabled).toBe(false);

    await submit.trigger("click");

    const events = wrapper.emitted("submit");
    expect(events).toBeTruthy();
    expect(events![0][0]).toEqual([
      { slug: "engineer", isPrimary: false },
      { slug: "product", isPrimary: true },
    ]);
  });

  it("pre-fills selection from initialSelection prop", async () => {
    const wrapper = mount(TeamPickerModal, {
      props: {
        initialSelection: [
          { slug: "user", isPrimary: true },
          { slug: "agent", isPrimary: false },
        ],
      },
    });
    await flushPromises();

    const userToggle = wrapper.find("[data-testid='team-toggle-user']");
    const agentToggle = wrapper.find("[data-testid='team-toggle-agent']");
    expect((userToggle.element as HTMLInputElement).checked).toBe(true);
    expect((agentToggle.element as HTMLInputElement).checked).toBe(true);
  });
});
