import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import UserProfileView from "./UserProfileView.vue";

const listUserActivity = vi.fn();
const listProjects = vi.fn();

vi.mock("@/api/user-activity.api", () => ({
  listUserActivity: (...a: unknown[]) => listUserActivity(...a),
}));
vi.mock("@/api/projects.api", () => ({
  listProjects: (...a: unknown[]) => listProjects(...a),
}));

const USER = { id: "user-1", displayName: "Dana Dev", actorType: "human" };

const TASK_REF = {
  id: "t-1",
  displayId: "FEAT-1",
  title: "A feature",
  flow: { id: "f-1", slug: "feature", name: "Feature" },
};

const COMMENT_EVENT = {
  id: "comment:c-1",
  type: "comment",
  timestamp: "2026-02-03T00:00:00.000Z",
  task: TASK_REF,
  commentId: "c-1",
  bodyPreview: "left a note",
};
const TRANSITION_EVENT = {
  id: "status_transition:tr-1",
  type: "status_transition",
  timestamp: "2026-02-02T00:00:00.000Z",
  task: TASK_REF,
  fromStatus: { id: "s1", slug: "discuss", name: "Discuss", color: null },
  toStatus: { id: "s2", slug: "design", name: "Design", color: null },
};
const CREATED_EVENT = {
  id: "task_created:t-1",
  type: "task_created",
  timestamp: "2026-02-01T00:00:00.000Z",
  task: TASK_REF,
};

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/users/:id", name: "user-profile", component: UserProfileView },
      { path: "/tasks/:flow/:taskId", name: "task-detail", component: { template: "<div />" } },
    ],
  });
}

async function mountView() {
  const router = makeRouter();
  await router.push("/users/user-1");
  await router.isReady();
  const wrapper = mount(UserProfileView, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  listUserActivity.mockReset();
  listProjects.mockReset();
  listProjects.mockResolvedValue([]);
  listUserActivity.mockResolvedValue({
    user: USER,
    data: [COMMENT_EVENT, TRANSITION_EVENT, CREATED_EVENT],
    pagination: { cursor: null, hasMore: false },
  });
});

describe("UserProfileView", () => {
  it("loads activity for the route's user id", async () => {
    await mountView();
    expect(listUserActivity).toHaveBeenCalledWith("user-1", expect.any(Object));
  });

  it("renders the profile header with the user's display name", async () => {
    const { wrapper } = await mountView();
    expect(wrapper.find("[data-testid='user-profile-name']").text()).toContain("Dana Dev");
  });

  it("renders all three event types in the timeline", async () => {
    const { wrapper } = await mountView();
    const items = wrapper.findAll("[data-testid='activity-item']");
    expect(items).toHaveLength(3);
    const types = items.map((i) => i.attributes("data-event-type"));
    expect(types).toEqual(["comment", "status_transition", "task_created"]);
    // type-specific content
    expect(wrapper.text()).toContain("left a note");
    expect(wrapper.text()).toContain("Discuss");
    expect(wrapper.text()).toContain("Design");
    expect(wrapper.text()).toContain("FEAT-1");
  });

  it("shows an empty state when there is no activity", async () => {
    listUserActivity.mockResolvedValueOnce({
      user: USER,
      data: [],
      pagination: { cursor: null, hasMore: false },
    });
    const { wrapper } = await mountView();
    expect(wrapper.find("[data-testid='activity-empty']").exists()).toBe(true);
  });

  it("loads more via the cursor and appends results", async () => {
    listUserActivity.mockReset();
    listUserActivity
      .mockResolvedValueOnce({
        user: USER,
        data: [COMMENT_EVENT],
        pagination: { cursor: "2026-02-03T00:00:00.000Z", hasMore: true },
      })
      .mockResolvedValueOnce({
        user: USER,
        data: [CREATED_EVENT],
        pagination: { cursor: null, hasMore: false },
      });

    const { wrapper } = await mountView();
    expect(wrapper.findAll("[data-testid='activity-item']")).toHaveLength(1);

    const loadMore = wrapper.find("[data-testid='activity-load-more']");
    expect(loadMore.exists()).toBe(true);
    await loadMore.trigger("click");
    await flushPromises();

    expect(listUserActivity).toHaveBeenLastCalledWith(
      "user-1",
      expect.objectContaining({ cursor: "2026-02-03T00:00:00.000Z" }),
    );
    expect(wrapper.findAll("[data-testid='activity-item']")).toHaveLength(2);
    expect(wrapper.find("[data-testid='activity-load-more']").exists()).toBe(false);
  });

  it("re-fetches with a project filter when one is selected", async () => {
    listProjects.mockResolvedValueOnce([
      { id: "proj-1", key: "AAA", name: "Alpha", color: null },
    ]);
    const { wrapper } = await mountView();
    listUserActivity.mockClear();

    await wrapper.get("[data-testid='activity-project-filter']").setValue("proj-1");
    await flushPromises();

    expect(listUserActivity).toHaveBeenLastCalledWith(
      "user-1",
      expect.objectContaining({ projectId: "proj-1" }),
    );
  });
});
