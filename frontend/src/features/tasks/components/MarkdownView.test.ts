import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import MarkdownView from "./MarkdownView.vue";

describe("MarkdownView", () => {
  it("renders markdown as sanitized HTML", () => {
    const wrapper = mount(MarkdownView, {
      props: { source: "# Hello\n\nthis is **bold**." },
    });

    const html = wrapper.html();
    expect(html).toContain("<h1");
    expect(html).toContain("Hello");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("strips disallowed tags from the source", () => {
    const wrapper = mount(MarkdownView, {
      props: { source: "<script>alert('xss')</script>ok" },
    });

    const html = wrapper.html();
    expect(html).not.toContain("<script>");
    expect(html).toContain("ok");
  });
});
