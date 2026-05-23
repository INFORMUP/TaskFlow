import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import StatusBadge from "./StatusBadge.vue";

describe("StatusBadge", () => {
  it("renders the status name", () => {
    const wrapper = mount(StatusBadge, { props: { name: "Design", color: "#004de6" } });
    expect(wrapper.text()).toBe("Design");
  });

  it("colors the left border from the status color", () => {
    const wrapper = mount(StatusBadge, { props: { name: "Design", color: "#004de6" } });
    expect(wrapper.attributes("style")).toContain("border-left-color");
  });

  it("falls back to the default color when none is given", () => {
    const colored = mount(StatusBadge, { props: { name: "Design", color: "#004de6" } });
    const fallback = mount(StatusBadge, { props: { name: "Design", color: null } });
    // Both apply a left-border color, but the fallback resolves to a different
    // (default) color than the explicit one.
    expect(fallback.attributes("style")).toContain("border-left-color");
    expect(fallback.attributes("style")).not.toBe(colored.attributes("style"));
  });
});
