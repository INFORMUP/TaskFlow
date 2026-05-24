import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AppLayout from "./AppLayout.vue";

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "../../package.json"), "utf8")
) as { version: string };

async function makeRouter(meta: Record<string, unknown> = {}): Promise<Router> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { template: "<div/>" }, meta }],
  });
  router.push("/");
  await router.isReady();
  return router;
}

async function mountLayout(meta: Record<string, unknown> = {}) {
  const router = await makeRouter(meta);
  return mount(AppLayout, {
    global: {
      plugins: [router],
      stubs: { NavBar: true, FeedbackBubble: true },
    },
  });
}

describe("AppLayout", () => {
  it("renders the app version in the footer", async () => {
    const wrapper = await mountLayout();
    expect(wrapper.find(".app-footer").text()).toBe(`TaskFlow v${pkg.version}`);
  });

  it("keeps the centered container by default", async () => {
    const wrapper = await mountLayout();
    expect(wrapper.find(".app-main").classes()).not.toContain("app-main--full");
  });

  it("goes full-bleed when the route opts in via meta.fullBleed", async () => {
    const wrapper = await mountLayout({ fullBleed: true });
    expect(wrapper.find(".app-main").classes()).toContain("app-main--full");
  });
});
