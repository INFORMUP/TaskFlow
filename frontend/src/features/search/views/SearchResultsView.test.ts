import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import SearchResultsView from "./SearchResultsView.vue";
import type { Task } from "@/api/tasks.api";

const getTasksMock = vi.fn();
vi.mock("@/api/tasks.api", () => ({
  getTasks: (...args: unknown[]) => getTasksMock(...args),
}));

const ALICE = { id: "u-1", displayName: "Alice", actorType: "human" };

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    displayId: "FEAT-1",
    title: "Sample task",
    description: null,
    priority: "medium",
    resolution: null,
    dueDate: null,
    flow: { id: "f-1", slug: "feature", name: "Feature" },
    currentStatus: { id: "s-1", slug: "discuss", name: "Discuss" },
    creator: ALICE,
    assignee: ALICE,
    projects: [],
    labels: [],
    createdAt: "2026-04-10T10:00:00.000Z",
    updatedAt: "2026-04-10T10:00:00.000Z",
    ...overrides,
  };
}

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/search", component: SearchResultsView },
      { path: "/tasks/:flow/:id", component: { template: "<div />" } },
    ],
  });
}

async function mountAt(query: string) {
  const router = makeRouter();
  await router.push(`/search${query}`);
  await router.isReady();
  const wrapper = mount(SearchResultsView, {
    global: { plugins: [router], stubs: { FilterBar: true } },
  });
  await flushPromises();
  return { wrapper, router };
}

describe("SearchResultsView", () => {
  beforeEach(() => getTasksMock.mockReset());

  it("searches across all flows for q + label and renders rows tagged with their flow", async () => {
    getTasksMock.mockResolvedValueOnce({
      data: [
        task({ id: "t-1", displayId: "FEAT-1", flow: { id: "f-1", slug: "feature", name: "Feature" } }),
        task({ id: "t-2", displayId: "BUG-2", flow: { id: "f-2", slug: "bug", name: "Bug" } }),
      ],
      pagination: { cursor: null, hasMore: false },
    });
    const { wrapper } = await mountAt("?q=foo&label=L1");

    expect(getTasksMock).toHaveBeenCalledTimes(1);
    const params = getTasksMock.mock.calls[0][0];
    expect(params).toMatchObject({ q: "foo", label: "L1" });
    expect(params).not.toHaveProperty("flow");

    const text = wrapper.text();
    expect(text).toContain("FEAT-1");
    expect(text).toContain("BUG-2");
    expect(text).toContain("Feature");
    expect(text).toContain("Bug");
  });

  it("intersects multiple labels (comma-joined)", async () => {
    getTasksMock.mockResolvedValueOnce({ data: [], pagination: { cursor: null, hasMore: false } });
    await mountAt("?label=L1&label=L2");
    expect(getTasksMock).toHaveBeenCalledTimes(1);
    expect(getTasksMock.mock.calls[0][0]).toMatchObject({ label: "L1,L2" });
  });

  it("does not fetch and shows a prompt when there are no criteria", async () => {
    const { wrapper } = await mountAt("");
    expect(getTasksMock).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="search-empty-prompt"]').exists()).toBe(true);
  });

  it("shows a no-results message when the query matches nothing", async () => {
    getTasksMock.mockResolvedValueOnce({ data: [], pagination: { cursor: null, hasMore: false } });
    const { wrapper } = await mountAt("?q=zzz");
    expect(wrapper.find('[data-testid="search-no-results"]').exists()).toBe(true);
  });

  it("paginates: Load more fetches the next page with a cursor and appends", async () => {
    getTasksMock
      .mockResolvedValueOnce({
        data: [task({ id: "t-1", displayId: "FEAT-1" })],
        pagination: { cursor: "2026-04-10T10:00:00.000Z", hasMore: true },
      })
      .mockResolvedValueOnce({
        data: [task({ id: "t-2", displayId: "FEAT-2" })],
        pagination: { cursor: null, hasMore: false },
      });
    const { wrapper } = await mountAt("?q=foo");

    const more = wrapper.find('[data-testid="search-load-more"]');
    expect(more.exists()).toBe(true);
    await more.trigger("click");
    await flushPromises();

    expect(getTasksMock).toHaveBeenCalledTimes(2);
    expect(getTasksMock.mock.calls[1][0]).toMatchObject({
      q: "foo",
      cursor: "2026-04-10T10:00:00.000Z",
    });
    expect(wrapper.text()).toContain("FEAT-1");
    expect(wrapper.text()).toContain("FEAT-2");
    expect(wrapper.find('[data-testid="search-load-more"]').exists()).toBe(false);
  });
});
