import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ProjectChip from "./ProjectChip.vue";

describe("ProjectChip", () => {
  it("renders the project key uppercased via styling", () => {
    const wrapper = mount(ProjectChip, { props: { projectKey: "TF" } });
    expect(wrapper.text()).toBe("TF");
  });

  it("uses the provided color", () => {
    const wrapper = mount(ProjectChip, { props: { projectKey: "WEB", color: "#ec4899" } });
    expect(wrapper.element.getAttribute("style") ?? "").toContain("background-color: #ec4899");
  });

  it("falls back to a default color when none is provided", () => {
    const wrapper = mount(ProjectChip, { props: { projectKey: "TF", color: null } });
    expect(wrapper.element.getAttribute("style") ?? "").toContain("background-color: #475569");
  });

  it("uses the project name as title when given", () => {
    const wrapper = mount(ProjectChip, {
      props: { projectKey: "TF", name: "TaskFlow", color: "#a855f7" },
    });
    expect(wrapper.attributes("title")).toBe("TaskFlow");
  });
});
