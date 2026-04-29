import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter, RouterView } from "vue-router";
import { useTaskFilters, toApiParams, type TaskFilters } from "./useTaskFilters";

function setupWithQuery(query: Record<string, string> = {}) {
  let captured: ReturnType<typeof useTaskFilters>;
  const Probe = defineComponent({
    setup() {
      captured = useTaskFilters();
      return () => h("div");
    },
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: Probe }],
  });
  const search = new URLSearchParams(query).toString();
  router.push(search ? `/?${search}` : "/");
  return router.isReady().then(() => {
    mount(RouterView, { global: { plugins: [router] } });
    return { router, get filters() { return captured.filters.value; }, captured: () => captured };
  });
}

describe("useTaskFilters", () => {
  it("reads q from the URL query", async () => {
    const ctx = await setupWithQuery({ q: "login bug" });
    expect(ctx.filters.q).toBe("login bug");
  });

  it("writes q back to the URL via setFilters", async () => {
    const ctx = await setupWithQuery();
    ctx.captured().setFilters({ q: "redirect" });
    await ctx.router.isReady();
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.router.currentRoute.value.query.q).toBe("redirect");
  });

  it("clears q when setFilters is called with empty string", async () => {
    const ctx = await setupWithQuery({ q: "stale" });
    ctx.captured().setFilters({ q: "" });
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.router.currentRoute.value.query.q).toBeUndefined();
  });

  it("toApiParams forwards q", () => {
    const f: TaskFilters = {
      projectId: "",
      projectOwnerUserId: "",
      status: [],
      priority: "",
      assigneeUserId: "",
      dueAfter: "",
      dueBefore: "",
      q: "search me",
      labelIds: [],
      view: "board",
    };
    expect(toApiParams(f)).toEqual({ q: "search me" });
  });

  it("toApiParams omits q when empty", () => {
    const f: TaskFilters = {
      projectId: "abc",
      projectOwnerUserId: "",
      status: [],
      priority: "",
      assigneeUserId: "",
      dueAfter: "",
      dueBefore: "",
      q: "",
      labelIds: [],
      view: "board",
    };
    expect(toApiParams(f)).toEqual({ projectId: "abc" });
  });

  it("reads a single status from the URL as a one-element array", async () => {
    const ctx = await setupWithQuery({ status: "implement" });
    expect(ctx.filters.status).toEqual(["implement"]);
  });

  it("reads repeated status params from the URL as an array", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", component: defineComponent({ setup() { return () => h("div"); } }) }],
    });
    await router.push("/?status=implement&status=validate");
    let captured: ReturnType<typeof useTaskFilters>;
    const Probe = defineComponent({
      setup() {
        captured = useTaskFilters();
        return () => h("div");
      },
    });
    router.addRoute({ path: "/probe", component: Probe });
    await router.push("/probe?status=implement&status=validate");
    mount(RouterView, { global: { plugins: [router] } });
    expect(captured!.filters.value.status).toEqual(["implement", "validate"]);
  });

  it("writes a multi-status array as repeated query params", async () => {
    const ctx = await setupWithQuery();
    ctx.captured().setFilters({ status: ["implement", "validate"] });
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.router.currentRoute.value.query.status).toEqual(["implement", "validate"]);
  });

  it("clears status when set to an empty array", async () => {
    const ctx = await setupWithQuery({ status: "implement" });
    ctx.captured().setFilters({ status: [] });
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.router.currentRoute.value.query.status).toBeUndefined();
  });

  it("toApiParams emits status as an array", () => {
    const f: TaskFilters = {
      projectId: "",
      projectOwnerUserId: "",
      status: ["implement", "validate"],
      priority: "",
      assigneeUserId: "",
      dueAfter: "",
      dueBefore: "",
      q: "",
      labelIds: [],
      view: "board",
    };
    expect(toApiParams(f)).toEqual({ status: ["implement", "validate"] });
  });

  it("toApiParams emits labelIds as comma-joined `label`", () => {
    const f: TaskFilters = {
      projectId: "",
      projectOwnerUserId: "",
      status: [],
      priority: "",
      assigneeUserId: "",
      dueAfter: "",
      dueBefore: "",
      q: "",
      labelIds: ["a", "b"],
      view: "board",
    };
    expect(toApiParams(f)).toEqual({ label: "a,b" });
  });

  it("reads repeated label query params", async () => {
    const ctx = await setupWithQuery();
    await ctx.router.push({ path: "/", query: { label: ["aa", "bb"] } });
    expect(ctx.filters.labelIds).toEqual(["aa", "bb"]);
  });

  it("setFilters({ labelIds }) round-trips through the URL", async () => {
    const ctx = await setupWithQuery();
    ctx.captured().setFilters({ labelIds: ["x", "y"] });
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.router.currentRoute.value.query.label).toEqual(["x", "y"]);
  });

  it("setFilters({ labelIds: [] }) clears the label query param", async () => {
    const ctx = await setupWithQuery({ label: "stale" });
    ctx.captured().setFilters({ labelIds: [] });
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.router.currentRoute.value.query.label).toBeUndefined();
  });
});
