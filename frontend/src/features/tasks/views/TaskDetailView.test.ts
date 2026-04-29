import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import TaskDetailView from "./TaskDetailView.vue";
import type { Task } from "@/api/tasks.api";
import type { Transition } from "@/api/transitions.api";
import type { Comment } from "@/api/comments.api";

const getTask = vi.fn();
const getTransitions = vi.fn();
const getAvailableTransitions = vi.fn();
const getComments = vi.fn();
const apiFetch = vi.fn();

vi.mock("@/api/tasks.api", () => ({
  getTask: (...a: unknown[]) => getTask(...a),
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
vi.mock("@/api/client", () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
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
  getTransitions.mockReset();
  getAvailableTransitions.mockReset();
  getComments.mockReset();
  apiFetch.mockReset();
  getTask.mockResolvedValue(taskFixture());
  getTransitions.mockResolvedValue({ data: [transitionFixture()] });
  getAvailableTransitions.mockResolvedValue({ data: [] });
  getComments.mockResolvedValue({ data: [commentFixture()] });
  apiFetch.mockResolvedValue({ data: [] });
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
