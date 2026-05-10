import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import FlowIcon from "./FlowIcon.vue";

describe("FlowIcon", () => {
  it("renders an svg path for a known icon", () => {
    const wrapper = mount(FlowIcon, { props: { icon: "bug" } });
    const svg = wrapper.find("svg");
    expect(svg.exists()).toBe(true);
    expect(svg.find("path").exists()).toBe(true);
  });

  it("renders a fallback span for an unknown icon", () => {
    const wrapper = mount(FlowIcon, { props: { icon: "made-up" } });
    expect(wrapper.find("svg").exists()).toBe(false);
    expect(wrapper.find(".flow-icon__fallback").exists()).toBe(true);
  });

  it("renders the fallback when icon is null", () => {
    const wrapper = mount(FlowIcon, { props: { icon: null } });
    expect(wrapper.find("svg").exists()).toBe(false);
    expect(wrapper.find(".flow-icon__fallback").exists()).toBe(true);
  });

  it("uses flowName as the title for hover tooltip", () => {
    const wrapper = mount(FlowIcon, { props: { icon: "bug", flowName: "Bug" } });
    expect(wrapper.attributes("title")).toBe("Bug");
  });
});
