import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import TaskDetailView from "./TaskDetailView.vue";
import type { Task } from "@/api/tasks.api";
import type { Transition } from "@/api/transitions.api";
import type { Comment } from "@/api/comments.api";

const getTask = vi.fn();
const updateTask = vi.fn();
const getTasks = vi.fn();
const getTransitions = vi.fn();
const getAvailableTransitions = vi.fn();
const getComments = vi.fn();
const listOrgMembers = vi.fn();

vi.mock("@/api/tasks.api", () => ({
  getTask: (...a: unknown[]) => getTask(...a),
  updateTask: (...a: unknown[]) => updateTask(...a),
  getTasks: (...a: unknown[]) => getTasks(...a),
}));
vi.mock("@/api/transitions.api", () => ({
  getTransitions: (...a: unknown[]) => getTransitions(...a),
  getAvailableTransitions: (...a: unknown[]) => getAvailableTransitions(...a),
  createTransition: vi.fn(),
}));
vi.mock("@/api/comments.api", () => ({
  getComments: (...a: unknown[]) => getComments(...a),
  createComment: vi.fn(),
  deleteComment: vi.fn(),
}));
vi.mock("@/api/org-members.api", () => ({
  listOrgMembers: (...a: unknown[]) => listOrgMembers(...a),
}));
vi.mock("@/api/labels.api", () => ({
  listLabels: vi.fn().mockResolvedValue([]),
  attachLabelToTask: vi.fn(),
  detachLabelFromTask: vi.fn(),
}));

const HUMAN = { id: "u-human", displayName: "Alice", actorType: "human" };
const AGENT = { id: "u-agent", displayName: "Agent-42", actorType: "agent" };

function taskFixture(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    displayId: "BUG-1",
    title: "A task",
    description: null,
    priority: "medium",
    resolution: null,
    dueDate: null,
    flow: { id: "f-1", slug: "bug", name: "Bugs" },
    currentStatus: { id: "s-1", slug: "open", name: "Open" },
    creator: HUMAN,
    assignee: AGENT,
    projects: [],
    labels: [],
    createdAt: "2026-04-10T10:00:00.000Z",
    updatedAt: "2026-04-10T10:00:00.000Z",
    ...overrides,
  };
}

function transitionFixture(overrides: Partial<Transition> = {}): Transition {
  return {
    id: "tr-1",
    fromStatus: null,
    toStatus: { id: "s-1", slug: "open", name: "Open" },
    actor: AGENT,
    actorType: "agent",
    note: "created by automation",
    newAssignee: null,
    createdAt: "2026-04-10T10:00:00.000Z",
    ...overrides,
  };
}

function commentFixture(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "c-1",
    body: "a remark",
    author: AGENT,
    createdAt: "2026-04-10T10:05:00.000Z",
    updatedAt: "2026-04-10T10:05:00.000Z",
    ...overrides,
  };
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: "/tasks/:flow/:taskId",
        name: "task-detail",
        component: { template: "<div />" },
      },
      {
        path: "/tasks/:flow",
        name: "task-board",
        component: { template: "<div />" },
      },
      {
        path: "/tasks/new",
        name: "task-new",
        component: { template: "<div />" },
      },
    ],
  });
}

async function mountDetail() {
  const router = makeRouter();
  await router.push("/tasks/bug/t-1");
  const wrapper = mount(TaskDetailView, {
    global: { plugins: [router] },
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  getTask.mockReset();
  updateTask.mockReset();
  getTasks.mockReset();
  getTasks.mockResolvedValue({ data: [], pagination: { cursor: null, hasMore: false } });
  getTransitions.mockReset();
  getAvailableTransitions.mockReset();
  getComments.mockReset();
  listOrgMembers.mockReset();
  getTask.mockResolvedValue(taskFixture());
  getTransitions.mockResolvedValue({ data: [transitionFixture()] });
  getAvailableTransitions.mockResolvedValue({ data: [] });
  getComments.mockResolvedValue({ data: [commentFixture()] });
  listOrgMembers.mockResolvedValue([]);
});

describe("TaskDetailView — transition status options", () => {
  it("renders the options returned by /available-transitions", async () => {
    getAvailableTransitions.mockResolvedValue({
      data: [
        { id: "s-2", slug: "investigate", name: "Investigate" },
        { id: "s-3", slug: "closed", name: "Closed" },
      ],
    });
    const wrapper = await mountDetail();
    const select = wrapper.find("select[aria-label='New status']");
    const options = select.findAll("option").map((o) => ({
      value: o.attributes("value"),
      text: o.text(),
    }));
    expect(options).toEqual([
      { value: "", text: "Select status..." },
      { value: "investigate", text: "Investigate" },
      { value: "closed", text: "Closed" },
    ]);
  });

  it("does not hardcode 'Closed' as the only option", async () => {
    getAvailableTransitions.mockResolvedValue({
      data: [{ id: "s-9", slug: "design", name: "Design" }],
    });
    const wrapper = await mountDetail();
    const select = wrapper.find("select[aria-label='New status']");
    const slugs = select.findAll("option").map((o) => o.attributes("value"));
    expect(slugs).toContain("design");
    expect(slugs).not.toContain("closed");
  });

  it("disables the select with a hint when no transitions are available", async () => {
    getAvailableTransitions.mockResolvedValue({ data: [] });
    const wrapper = await mountDetail();
    const select = wrapper.find("select[aria-label='New status']");
    expect(select.attributes("disabled")).toBeDefined();
    expect(select.text()).toContain("No transitions available");
  });
});

describe("TaskDetailView — agent actor display", () => {
  it("shows the agent badge in transition history for an agent actor", async () => {
    const wrapper = await mountDetail();
    const badges = wrapper.findAll("[data-testid='actor-agent-badge']");
    expect(badges.length).toBeGreaterThan(0);
    const html = wrapper.html();
    expect(html).toContain("Agent-42");
  });

  it("shows the agent badge on comment authors when the author is an agent", async () => {
    const wrapper = await mountDetail();
    // Ensure at least one badge lives inside a comment block.
    const comment = wrapper.find(".comment");
    expect(comment.exists()).toBe(true);
    expect(comment.find("[data-testid='actor-agent-badge']").exists()).toBe(
      true
    );
  });

  it("shows the agent badge on the assignee line in task metadata", async () => {
    const wrapper = await mountDetail();
    const meta = wrapper.find(".detail__meta");
    expect(meta.text()).toContain("Agent-42");
    expect(meta.find("[data-testid='actor-agent-badge']").exists()).toBe(true);
  });

  it("renders comment bodies as markdown", async () => {
    getComments.mockResolvedValue({
      data: [commentFixture({ body: "**bold** and `code` and a [link](https://example.com)" })],
    });
    const wrapper = await mountDetail();
    const comment = wrapper.find(".comment");
    expect(comment.exists()).toBe(true);
    const html = comment.html();
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain('href="https://example.com"');
  });

  it("renders 'Spawned from' link when the task has a parent", async () => {
    getTask.mockResolvedValue(
      taskFixture({
        spawnedFromTask: {
          id: "parent-id",
          displayId: "FEAT-99",
          title: "Parent task",
          flow: { slug: "feature" },
        },
      })
    );
    const wrapper = await mountDetail();
    const link = wrapper.find(".detail__spawned-from a");
    expect(link.exists()).toBe(true);
    expect(link.text()).toContain("FEAT-99");
    expect(link.text()).toContain("Parent task");
    expect(link.attributes("href")).toBe("/tasks/feature/parent-id");
  });

  it("renders 'Follow-ups' section listing spawned tasks", async () => {
    getTask.mockResolvedValue(
      taskFixture({
        spawnedTasks: [
          {
            id: "child-id",
            displayId: "FEAT-100",
            title: "Follow-up A",
            flow: { slug: "feature" },
            currentStatus: { slug: "discuss", name: "Discuss" },
          },
        ],
      })
    );
    const wrapper = await mountDetail();
    const section = wrapper.find(".detail__followups");
    expect(section.exists()).toBe(true);
    expect(section.text()).toContain("FEAT-100");
    expect(section.text()).toContain("Follow-up A");
    expect(section.text()).toContain("Discuss");
    expect(section.find("a").attributes("href")).toBe("/tasks/feature/child-id");
  });

  it("hides 'Spawned from' and 'Follow-ups' on a regular task", async () => {
    const wrapper = await mountDetail();
    expect(wrapper.find(".detail__spawned-from").exists()).toBe(false);
    expect(wrapper.find(".detail__followups").exists()).toBe(false);
  });

  it("does not show the agent badge for a human actor", async () => {
    getTransitions.mockResolvedValue({
      data: [transitionFixture({ actor: HUMAN, actorType: "human" })],
    });
    getComments.mockResolvedValue({
      data: [commentFixture({ author: HUMAN })],
    });
    getTask.mockResolvedValue(taskFixture({ assignee: HUMAN, creator: HUMAN }));

    const wrapper = await mountDetail();
    expect(wrapper.find("[data-testid='actor-agent-badge']").exists()).toBe(
      false
    );
  });
});

describe("TaskDetailView — standalone reassignment", () => {
  function mockUsers() {
    listOrgMembers.mockResolvedValue([HUMAN, AGENT]);
  }

  it("renders a clickable assignee chip showing the current assignee", async () => {
    const wrapper = await mountDetail();
    const btn = wrapper.find("[data-testid='detail-assignee-btn']");
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toContain("Agent-42");
    expect(btn.attributes("aria-label")).toContain("Reassign");
  });

  it("shows 'Unassigned' when task has no assignee", async () => {
    getTask.mockResolvedValue(taskFixture({ assignee: null }));
    const wrapper = await mountDetail();
    const btn = wrapper.find("[data-testid='detail-assignee-btn']");
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toContain("Unassigned");
    expect(btn.attributes("aria-label")).toBe("Assign");
  });

  it("opens the AssigneePicker when the assignee chip is clicked", async () => {
    mockUsers();
    const wrapper = await mountDetail();
    await wrapper.find("[data-testid='detail-assignee-btn']").trigger("click");
    await flushPromises();
    expect(wrapper.find(".picker").exists()).toBe(true);
  });

  it("PATCHes assigneeUserId when a user is picked", async () => {
    mockUsers();
    updateTask.mockResolvedValue(taskFixture({ assignee: HUMAN }));
    const wrapper = await mountDetail();
    await wrapper.find("[data-testid='detail-assignee-btn']").trigger("click");
    await flushPromises();
    const aliceOption = wrapper
      .findAll(".picker__option")
      .find((o) => o.text().includes("Alice"));
    expect(aliceOption).toBeTruthy();
    await aliceOption!.trigger("click");
    await flushPromises();
    expect(updateTask).toHaveBeenCalledWith("t-1", { assigneeUserId: "u-human" });
  });

  it("PATCHes assigneeUserId=null when 'Unassigned' is picked", async () => {
    mockUsers();
    updateTask.mockResolvedValue(taskFixture({ assignee: null }));
    const wrapper = await mountDetail();
    await wrapper.find("[data-testid='detail-assignee-btn']").trigger("click");
    await flushPromises();
    const unassignedOption = wrapper
      .findAll(".picker__option")
      .find((o) => o.text().trim() === "Unassigned");
    expect(unassignedOption).toBeTruthy();
    await unassignedOption!.trigger("click");
    await flushPromises();
    expect(updateTask).toHaveBeenCalledWith("t-1", { assigneeUserId: null });
  });

  it("updates the displayed assignee after a successful reassignment", async () => {
    mockUsers();
    updateTask.mockResolvedValue(taskFixture({ assignee: HUMAN }));
    const wrapper = await mountDetail();
    await wrapper.find("[data-testid='detail-assignee-btn']").trigger("click");
    await flushPromises();
    const aliceOption = wrapper
      .findAll(".picker__option")
      .find((o) => o.text().includes("Alice"))!;
    await aliceOption.trigger("click");
    await flushPromises();
    const btn = wrapper.find("[data-testid='detail-assignee-btn']");
    expect(btn.text()).toContain("Alice");
  });

  it("shows an error message when reassignment fails", async () => {
    mockUsers();
    updateTask.mockRejectedValue({ error: { message: "Forbidden" } });
    const wrapper = await mountDetail();
    await wrapper.find("[data-testid='detail-assignee-btn']").trigger("click");
    await flushPromises();
    const aliceOption = wrapper
      .findAll(".picker__option")
      .find((o) => o.text().includes("Alice"))!;
    await aliceOption.trigger("click");
    await flushPromises();
    const err = wrapper.find("[data-testid='detail-assignee-error']");
    expect(err.exists()).toBe(true);
    expect(err.text()).toContain("Forbidden");
  });
});

describe("TaskDetailView — inline title editing", () => {
  it("renders an edit button next to the title", async () => {
    const wrapper = await mountDetail();
    expect(wrapper.find("[data-testid='detail-title-edit-btn']").exists()).toBe(true);
  });

  it("shows an input pre-filled with the current title when edit is clicked", async () => {
    const wrapper = await mountDetail();
    await wrapper.find("[data-testid='detail-title-edit-btn']").trigger("click");
    const input = wrapper.find("[data-testid='detail-title-input']");
    expect(input.exists()).toBe(true);
    expect((input.element as HTMLInputElement).value).toBe("A task");
  });

  it("hides the h1 and edit button while the input is open", async () => {
    const wrapper = await mountDetail();
    await wrapper.find("[data-testid='detail-title-edit-btn']").trigger("click");
    expect(wrapper.find("h1.detail__title").exists()).toBe(false);
    expect(wrapper.find("[data-testid='detail-title-edit-btn']").exists()).toBe(false);
  });

  it("calls updateTask with the new title when Enter is pressed", async () => {
    updateTask.mockResolvedValue(taskFixture({ title: "Updated title" }));
    const wrapper = await mountDetail();
    await wrapper.find("[data-testid='detail-title-edit-btn']").trigger("click");
    const input = wrapper.find("[data-testid='detail-title-input']");
    await input.setValue("Updated title");
    await input.trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(updateTask).toHaveBeenCalledWith("t-1", { title: "Updated title" });
  });

  it("exits edit mode and restores the title when Escape is pressed", async () => {
    const wrapper = await mountDetail();
    await wrapper.find("[data-testid='detail-title-edit-btn']").trigger("click");
    const input = wrapper.find("[data-testid='detail-title-input']");
    await input.setValue("Something else");
    await input.trigger("keydown", { key: "Escape" });
    await flushPromises();
    expect(updateTask).not.toHaveBeenCalled();
    expect(wrapper.find("h1.detail__title").text()).toBe("A task");
  });

  it("does not save and shows an error when the title is blank", async () => {
    const wrapper = await mountDetail();
    await wrapper.find("[data-testid='detail-title-edit-btn']").trigger("click");
    const input = wrapper.find("[data-testid='detail-title-input']");
    await input.setValue("   ");
    await input.trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(updateTask).not.toHaveBeenCalled();
    expect(wrapper.find("[data-testid='detail-title-error']").exists()).toBe(true);
  });
});

describe("TaskDetailView — description editing", () => {
  it("renders an edit button when the task has a description", async () => {
    getTask.mockResolvedValue(taskFixture({ description: "Hello **world**" }));
    const wrapper = await mountDetail();
    expect(wrapper.find("[data-testid='detail-description-edit-btn']").exists()).toBe(true);
  });

  it("renders an 'Add description' button when the task has no description", async () => {
    const wrapper = await mountDetail(); // fixture has description: null
    expect(wrapper.find("[data-testid='detail-description-add-btn']").exists()).toBe(true);
  });

  it("shows a textarea pre-filled with the description when edit is clicked", async () => {
    getTask.mockResolvedValue(taskFixture({ description: "Hello **world**" }));
    const wrapper = await mountDetail();
    await wrapper.find("[data-testid='detail-description-edit-btn']").trigger("click");
    const ta = wrapper.find("[data-testid='detail-description-textarea']");
    expect(ta.exists()).toBe(true);
    expect((ta.element as HTMLTextAreaElement).value).toBe("Hello **world**");
  });

  it("shows an empty textarea when 'Add description' is clicked", async () => {
    const wrapper = await mountDetail();
    await wrapper.find("[data-testid='detail-description-add-btn']").trigger("click");
    const ta = wrapper.find("[data-testid='detail-description-textarea']");
    expect(ta.exists()).toBe(true);
    expect((ta.element as HTMLTextAreaElement).value).toBe("");
  });

  it("calls updateTask with the new description when Save is clicked", async () => {
    getTask.mockResolvedValue(taskFixture({ description: "old" }));
    updateTask.mockResolvedValue(taskFixture({ description: "new content" }));
    const wrapper = await mountDetail();
    await wrapper.find("[data-testid='detail-description-edit-btn']").trigger("click");
    const ta = wrapper.find("[data-testid='detail-description-textarea']");
    await ta.setValue("new content");
    await wrapper.find("[data-testid='detail-description-save-btn']").trigger("click");
    await flushPromises();
    expect(updateTask).toHaveBeenCalledWith("t-1", { description: "new content" });
  });

  it("exits edit mode without saving when Cancel is clicked", async () => {
    getTask.mockResolvedValue(taskFixture({ description: "original" }));
    const wrapper = await mountDetail();
    await wrapper.find("[data-testid='detail-description-edit-btn']").trigger("click");
    await wrapper.find("[data-testid='detail-description-textarea']").setValue("changed");
    await wrapper.find("[data-testid='detail-description-cancel-btn']").trigger("click");
    await flushPromises();
    expect(updateTask).not.toHaveBeenCalled();
    expect(wrapper.find("[data-testid='detail-description-textarea']").exists()).toBe(false);
  });

  it("updates the displayed description after a successful save", async () => {
    getTask.mockResolvedValue(taskFixture({ description: "old" }));
    updateTask.mockResolvedValue(taskFixture({ description: "new content" }));
    const wrapper = await mountDetail();
    await wrapper.find("[data-testid='detail-description-edit-btn']").trigger("click");
    await wrapper.find("[data-testid='detail-description-textarea']").setValue("new content");
    await wrapper.find("[data-testid='detail-description-save-btn']").trigger("click");
    await flushPromises();
    expect(wrapper.find("[data-testid='detail-description-textarea']").exists()).toBe(false);
    expect(wrapper.find("[data-testid='detail-description-edit-btn']").exists()).toBe(true);
  });
});

describe("TaskDetailView — parent controls (FEAT-116)", () => {
  const CANDIDATE = {
    id: "parent-id",
    displayId: "FEAT-99",
    title: "Parent task",
    flow: { slug: "feature", name: "Feature" },
    currentStatus: { slug: "discuss", name: "Discuss" },
  };

  it("sets a parent via the picker and updates the view", async () => {
    getTasks.mockResolvedValue({
      data: [CANDIDATE],
      pagination: { cursor: null, hasMore: false },
    });
    updateTask.mockResolvedValue(
      taskFixture({
        spawnedFromTask: {
          id: "parent-id",
          displayId: "FEAT-99",
          title: "Parent task",
          flow: { slug: "feature" },
        },
      })
    );
    const wrapper = await mountDetail();

    await wrapper.find("[data-testid='detail-set-parent-btn']").trigger("click");
    await flushPromises();
    const option = wrapper
      .findAll(".picker__option")
      .find((o) => o.text().includes("Parent task"))!;
    expect(option).toBeTruthy();
    await option.trigger("click");
    await flushPromises();

    expect(updateTask).toHaveBeenCalledWith("t-1", { spawnedFromTaskId: "parent-id" });
    expect(wrapper.find(".detail__spawned-from").text()).toContain("FEAT-99");
  });

  it("surfaces a PARENT_CYCLE error inline", async () => {
    getTasks.mockResolvedValue({
      data: [CANDIDATE],
      pagination: { cursor: null, hasMore: false },
    });
    updateTask.mockRejectedValue({
      error: { code: "PARENT_CYCLE", message: "A task cannot be its own parent" },
    });
    const wrapper = await mountDetail();

    await wrapper.find("[data-testid='detail-set-parent-btn']").trigger("click");
    await flushPromises();
    const option = wrapper
      .findAll(".picker__option")
      .find((o) => o.text().includes("Parent task"))!;
    await option.trigger("click");
    await flushPromises();

    const err = wrapper.find("[data-testid='detail-parent-error']");
    expect(err.exists()).toBe(true);
    expect(err.text()).toContain("A task cannot be its own parent");
  });

  it("clears the parent with spawnedFromTaskId=null", async () => {
    getTask.mockResolvedValue(
      taskFixture({
        spawnedFromTask: {
          id: "parent-id",
          displayId: "FEAT-99",
          title: "Parent task",
          flow: { slug: "feature" },
        },
      })
    );
    updateTask.mockResolvedValue(taskFixture({ spawnedFromTask: null }));
    const wrapper = await mountDetail();

    await wrapper.find("[data-testid='detail-clear-parent-btn']").trigger("click");
    await flushPromises();

    expect(updateTask).toHaveBeenCalledWith("t-1", { spawnedFromTaskId: null });
  });

  it("navigates to task-new with flow and parent query on spawn sub-task", async () => {
    const wrapper = await mountDetail();
    const router = wrapper.vm.$router;
    const push = vi.spyOn(router, "push");

    await wrapper.find("[data-testid='detail-spawn-subtask-btn']").trigger("click");
    await flushPromises();

    expect(push).toHaveBeenCalledWith({
      name: "task-new",
      query: { flow: "bug", parent: "t-1" },
    });
  });
});
