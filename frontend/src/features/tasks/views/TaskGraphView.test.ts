import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";
import { createRouter, createMemoryHistory } from "vue-router";

const getTaskGraph = vi.fn();

vi.mock("@/api/tasks.api", () => ({
  getTaskGraph: (...a: unknown[]) => getTaskGraph(...a),
}));

// Stub VueFlow to capture props and expose a way to fire node-click.
const lastFlowProps = ref<{ nodes: any[]; edges: any[] } | null>(null);
const flowEmit = ref<((event: string, payload: any) => void) | null>(null);

vi.mock("@vue-flow/core", () => {
  return {
    VueFlow: defineComponent({
      name: "VueFlowStub",
      props: ["nodes", "edges"],
      emits: ["node-click"],
      setup(props, { emit }) {
        flowEmit.value = (e: string, p: any) => emit(e as "node-click", p);
        return () => {
          lastFlowProps.value = {
            nodes: props.nodes as any[],
            edges: props.edges as any[],
          };
          return h("div", { "data-testid": "vue-flow-stub" });
        };
      },
    }),
    MarkerType: { ArrowClosed: "arrowclosed" },
  };
});
vi.mock("@vue-flow/background", () => ({
  Background: defineComponent({ render: () => h("div") }),
}));
vi.mock("@vue-flow/controls", () => ({
  Controls: defineComponent({ render: () => h("div") }),
}));
vi.mock("@vue-flow/core/dist/style.css", () => ({}));
vi.mock("@vue-flow/core/dist/theme-default.css", () => ({}));
vi.mock("@vue-flow/controls/dist/style.css", () => ({}));

const ROOT = {
  id: "root-id",
  displayId: "FEAT-1",
  title: "Root",
  flow: { slug: "feature", name: "Feature" },
  currentStatus: { slug: "implement", name: "Implement" },
  isRoot: true,
};
const CHILD = {
  id: "child-id",
  displayId: "FEAT-2",
  title: "Child",
  flow: { slug: "feature", name: "Feature" },
  currentStatus: { slug: "closed", name: "Closed" },
  isRoot: false,
};

import TaskGraphView from "./TaskGraphView.vue";

async function mountView() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div/>" } },
      {
        path: "/tasks/:flow/:taskId",
        name: "task-detail",
        component: { template: "<div/>" },
      },
      {
        path: "/tasks/:flow/:taskId/graph",
        name: "task-graph",
        component: TaskGraphView,
      },
    ],
  });
  router.push("/tasks/feature/root-id/graph");
  await router.isReady();
  const wrapper = mount(TaskGraphView, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  getTaskGraph.mockReset();
  lastFlowProps.value = null;
  flowEmit.value = null;
});

describe("TaskGraphView", () => {
  it("fetches the graph and passes nodes + edges to VueFlow", async () => {
    getTaskGraph.mockResolvedValueOnce({
      nodes: [ROOT, CHILD],
      edges: [{ from: ROOT.id, to: CHILD.id, type: "spawn" }],
    });

    await mountView();

    expect(getTaskGraph).toHaveBeenCalledWith("root-id");
    expect(lastFlowProps.value).not.toBeNull();
    expect(lastFlowProps.value!.nodes).toHaveLength(2);
    expect(lastFlowProps.value!.edges).toHaveLength(1);

    // Root node visually distinguished.
    const rootNode = lastFlowProps.value!.nodes.find((n) => n.id === ROOT.id)!;
    expect(rootNode.style.border).toContain("2px");

    // Closed node dimmed.
    const childNode = lastFlowProps.value!.nodes.find((n) => n.id === CHILD.id)!;
    expect(childNode.style.opacity).toBeLessThan(1);

    // Spawn edge styled with the spawn color (green); blocker would be red dashed.
    const edge = lastFlowProps.value!.edges[0];
    expect(edge.style.stroke).toBe("#10b981");
    expect(edge.style.strokeDasharray).toBeUndefined();
  });

  it("styles blocker edges differently from spawn edges", async () => {
    getTaskGraph.mockResolvedValueOnce({
      nodes: [ROOT, CHILD],
      edges: [{ from: CHILD.id, to: ROOT.id, type: "blocker" }],
    });

    await mountView();
    const edge = lastFlowProps.value!.edges[0];
    expect(edge.style.stroke).toBe("#ef4444");
    expect(edge.style.strokeDasharray).toBe("6 4");
    expect(edge.label).toBe("blocks");
  });

  it("navigates to the task detail page when a non-root node is clicked", async () => {
    getTaskGraph.mockResolvedValueOnce({
      nodes: [ROOT, CHILD],
      edges: [],
    });
    const { router } = await mountView();
    const pushSpy = vi.spyOn(router, "push");

    flowEmit.value!("node-click", {
      node: { id: CHILD.id, data: { node: CHILD } },
    });
    await flushPromises();

    expect(pushSpy).toHaveBeenCalledWith({
      name: "task-detail",
      params: { flow: "feature", taskId: CHILD.id },
    });
  });

  it("does not navigate when the root node is clicked", async () => {
    getTaskGraph.mockResolvedValueOnce({ nodes: [ROOT], edges: [] });
    const { router } = await mountView();
    const pushSpy = vi.spyOn(router, "push");

    flowEmit.value!("node-click", {
      node: { id: ROOT.id, data: { node: ROOT } },
    });
    await flushPromises();
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("shows an empty-state message when there are no relationships", async () => {
    getTaskGraph.mockResolvedValueOnce({ nodes: [ROOT], edges: [] });
    const { wrapper } = await mountView();
    expect(wrapper.get('[data-testid="graph-empty"]').text()).toContain(
      "No spawn or blocker relationships",
    );
  });

  it("renders a truncation notice when truncated is true", async () => {
    getTaskGraph.mockResolvedValueOnce({
      nodes: [ROOT, CHILD],
      edges: [{ from: ROOT.id, to: CHILD.id, type: "spawn" }],
      truncated: true,
    });
    const { wrapper } = await mountView();
    expect(wrapper.text()).toContain("truncated");
  });
});
