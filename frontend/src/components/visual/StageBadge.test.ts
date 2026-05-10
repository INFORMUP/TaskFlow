import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import StageBadge from "./StageBadge.vue";

describe("StageBadge", () => {
  it("renders the stage name", () => {
    const wrapper = mount(StageBadge, { props: { name: "Implement", color: "#f59e0b" } });
    expect(wrapper.text()).toBe("Implement");
  });

  it("applies the provided color as background", () => {
    const wrapper = mount(StageBadge, { props: { name: "Validate", color: "#14b8a6" } });
    expect(wrapper.element.getAttribute("style") ?? "").toContain("background-color: #14b8a6");
  });

  it("falls back to a default color when none is provided", () => {
    const wrapper = mount(StageBadge, { props: { name: "Closed", color: null } });
    expect(wrapper.element.getAttribute("style") ?? "").toContain("background-color: #6b7280");
  });
});
