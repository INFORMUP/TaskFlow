import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import GlobalSearch from "./GlobalSearch.vue";

const globalSearchMock = vi.fn();

vi.mock("@/api/search.api", () => ({
  globalSearch: (...args: unknown[]) => globalSearchMock(...args),
}));

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div />" } },
      { path: "/tasks", component: { template: "<div />" } },
      { path: "/tasks/:flow/:taskId", component: { template: "<div />" } },
      { path: "/projects/:id", component: { template: "<div />" } },
    ],
  });
}

async function flushDebounce() {
  await vi.advanceTimersByTimeAsync(250);
  await flushPromises();
}

describe("GlobalSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    globalSearchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not call the API for queries shorter than 2 chars", async () => {
    const router = makeRouter();
    const wrapper = mount(GlobalSearch, { global: { plugins: [router] } });

    const input = wrapper.find("input");
    await input.setValue("a");
    await flushDebounce();

    expect(globalSearchMock).not.toHaveBeenCalled();
  });

  it("debounces and shows grouped results", async () => {
    globalSearchMock.mockResolvedValueOnce({
      tasks: [
        {
          id: "t1",
          displayId: "FEAT-1",
          title: "Login redirect",
          snippet: "Login <mark>redirect</mark> bug",
          flow: { slug: "feature", name: "Feature" },
          currentStatus: { slug: "discuss", name: "Discuss" },
          createdAt: "2026-05-01T00:00:00Z",
        },
      ],
      projects: [
        {
          id: "p1",
          key: "TASKFLOW",
          name: "Taskflow",
          snippet: "<mark>Task</mark>flow",
          createdAt: "2026-04-01T00:00:00Z",
        },
      ],
    });
    const router = makeRouter();
    const wrapper = mount(GlobalSearch, { global: { plugins: [router] } });

    const input = wrapper.find("input");
    await input.setValue("login");
    await input.trigger("focus");
    await flushDebounce();

    expect(globalSearchMock).toHaveBeenCalledTimes(1);
    expect(globalSearchMock).toHaveBeenCalledWith("login", expect.objectContaining({ signal: expect.any(AbortSignal) }));

    const taskItems = wrapper.findAll('[data-testid="global-search-task"]');
    const projectItems = wrapper.findAll('[data-testid="global-search-project"]');
    expect(taskItems).toHaveLength(1);
    expect(projectItems).toHaveLength(1);
    expect(taskItems[0].html()).toContain("<mark>redirect</mark>");
  });

  it("renders <mark> from server snippet but escapes injected scripts", async () => {
    globalSearchMock.mockResolvedValueOnce({
      tasks: [
        {
          id: "t1",
          displayId: "FEAT-1",
          title: "T",
          snippet: "<mark>foo</mark><script>alert(1)</script>",
          flow: { slug: "feature", name: "Feature" },
          currentStatus: { slug: "discuss", name: "Discuss" },
          createdAt: "2026-05-01T00:00:00Z",
        },
      ],
      projects: [],
    });
    const router = makeRouter();
    const wrapper = mount(GlobalSearch, { global: { plugins: [router] } });

    await wrapper.find("input").setValue("foo");
    await flushDebounce();

    const html = wrapper.find('[data-testid="global-search-task"]').html();
    expect(html).toContain("<mark>foo</mark>");
    expect(html).not.toMatch(/<script>/);
    expect(html).toContain("&lt;script&gt;");
  });

  it("arrow + enter navigates to the active item", async () => {
    globalSearchMock.mockResolvedValueOnce({
      tasks: [
        {
          id: "t1",
          displayId: "FEAT-1",
          title: "Login redirect",
          snippet: "x",
          flow: { slug: "feature", name: "Feature" },
          currentStatus: { slug: "discuss", name: "Discuss" },
          createdAt: "2026-05-01T00:00:00Z",
        },
      ],
      projects: [],
    });
    const router = makeRouter();
    const pushSpy = vi.spyOn(router, "push");
    const wrapper = mount(GlobalSearch, { global: { plugins: [router] } });

    const input = wrapper.find("input");
    await input.setValue("login");
    await flushDebounce();

    await input.trigger("keydown", { key: "ArrowDown" });
    await input.trigger("keydown", { key: "Enter" });

    expect(pushSpy).toHaveBeenCalledWith("/tasks/feature/t1");
  });

  it("escape clears the query and closes the dropdown", async () => {
    globalSearchMock.mockResolvedValueOnce({ tasks: [], projects: [] });
    const router = makeRouter();
    const wrapper = mount(GlobalSearch, { global: { plugins: [router] } });

    const input = wrapper.find("input");
    await input.setValue("login");
    await flushDebounce();
    await input.trigger("keydown", { key: "Escape" });

    expect((input.element as HTMLInputElement).value).toBe("");
    expect(wrapper.find('[data-testid="global-search-panel"]').exists()).toBe(false);
  });
});
