import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createMemoryHistory, createRouter, RouterView } from "vue-router";
import { defineComponent, h } from "vue";
import FilterBar from "./FilterBar.vue";

vi.mock("@/api/projects.api", () => ({
  listProjects: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/api/org-members.api", () => ({
  listOrgMembers: vi.fn().mockResolvedValue([
    { id: "u-alice", displayName: "Alice", actorType: "human" },
    { id: "u-bob", displayName: "Bob", actorType: "human" },
  ]),
}));

vi.mock("@/api/labels.api", () => ({
  listLabels: vi.fn().mockResolvedValue([]),
}));

const Host = defineComponent({
  components: { FilterBar },
  template: '<FilterBar :statuses="[]" />',
});

async function setup(initialQuery: Record<string, string> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: Host }],
  });
  const search = new URLSearchParams(initialQuery).toString();
  router.push(search ? `/?${search}` : "/");
  await router.isReady();
  const wrapper = mount(RouterView, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}

describe("FilterBar assignee picker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Anyone, Me, and each org member as picker options", async () => {
    const { wrapper } = await setup();
    const select = wrapper.get('select[aria-label="Filter by assignee"]');
    const options = select.findAll("option").map((o) => ({
      value: o.attributes("value"),
      text: o.text(),
    }));
    expect(options[0]).toEqual({ value: "", text: "Anyone" });
    expect(options[1]).toEqual({ value: "me", text: "Me" });
    expect(options.find((o) => o.value === "u-alice")?.text).toBe("Alice");
    expect(options.find((o) => o.value === "u-bob")?.text).toBe("Bob");
  });

  it("writes assigneeUserId to the URL when an org member is picked", async () => {
    const { wrapper, router } = await setup();
    const select = wrapper.get('select[aria-label="Filter by assignee"]');
    await select.setValue("u-alice");
    await flushPromises();
    expect(router.currentRoute.value.query.assigneeUserId).toBe("u-alice");
  });

  it('still emits the literal "me" string when Me is selected (preserving the backend short-circuit)', async () => {
    const { wrapper, router } = await setup();
    const select = wrapper.get('select[aria-label="Filter by assignee"]');
    await select.setValue("me");
    await flushPromises();
    expect(router.currentRoute.value.query.assigneeUserId).toBe("me");
  });

  it("reflects the current URL value as the selected option", async () => {
    const { wrapper } = await setup({ assigneeUserId: "u-bob" });
    const select = wrapper.get(
      'select[aria-label="Filter by assignee"]',
    ).element as HTMLSelectElement;
    expect(select.value).toBe("u-bob");
  });
});
