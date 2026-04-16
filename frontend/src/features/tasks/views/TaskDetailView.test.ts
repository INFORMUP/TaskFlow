import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import TaskDetailView from "./TaskDetailView.vue";
import type { Task } from "@/api/tasks.api";
import type { Transition } from "@/api/transitions.api";
import type { Comment } from "@/api/comments.api";

const getTask = vi.fn();
const getTransitions = vi.fn();
const getComments = vi.fn();
const apiFetch = vi.fn();

vi.mock("@/api/tasks.api", () => ({
  getTask: (...a: unknown[]) => getTask(...a),
}));
vi.mock("@/api/transitions.api", () => ({
  getTransitions: (...a: unknown[]) => getTransitions(...a),
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
  getComments.mockReset();
  apiFetch.mockReset();
  getTask.mockResolvedValue(taskFixture());
  getTransitions.mockResolvedValue({ data: [transitionFixture()] });
  getComments.mockResolvedValue({ data: [commentFixture()] });
  apiFetch.mockResolvedValue({ data: [] });
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
