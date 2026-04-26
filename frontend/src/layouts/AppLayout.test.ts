import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AppLayout from "./AppLayout.vue";

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "../../package.json"), "utf8")
) as { version: string };

describe("AppLayout", () => {
  it("renders the app version in the footer", () => {
    const wrapper = mount(AppLayout, {
      global: {
        stubs: { NavBar: true, FeedbackBubble: true, RouterLink: true, RouterView: true },
      },
    });
    expect(wrapper.find(".app-footer").text()).toBe(`TaskFlow v${pkg.version}`);
  });
});
