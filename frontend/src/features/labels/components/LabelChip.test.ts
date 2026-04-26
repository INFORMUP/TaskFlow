import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import LabelChip from "./LabelChip.vue";

describe("LabelChip", () => {
  it("renders the label name", () => {
    const wrapper = mount(LabelChip, { props: { name: "frontend", color: "#ff8800" } });
    expect(wrapper.text()).toBe("frontend");
  });

  it("uses dark text on a light background", () => {
    const wrapper = mount(LabelChip, { props: { name: "x", color: "#ffff00" } });
    const style = wrapper.element.getAttribute("style") ?? "";
    expect(style).toContain("background-color: #ffff00");
    expect(style).toContain("color: #111827");
  });

  it("uses light text on a dark background", () => {
    const wrapper = mount(LabelChip, { props: { name: "x", color: "#0a0a0a" } });
    const style = wrapper.element.getAttribute("style") ?? "";
    expect(style).toContain("color: #ffffff");
  });

  it("falls back to black text on an invalid color", () => {
    const wrapper = mount(LabelChip, { props: { name: "x", color: "not-a-hex" } });
    const style = wrapper.element.getAttribute("style") ?? "";
    expect(style).toContain("color: #000");
  });
});
