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
  currentStatus: { slug: "implement", name: "Implement", color: "#f59e0b" },
  projects: [{ key: "TF", name: "Taskflow", color: "#df6807" }],
  isRoot: true,
};
const CHILD = {
  id: "child-id",
  displayId: "FEAT-2",
  title: "Child",
  flow: { slug: "feature", name: "Feature" },
  currentStatus: { slug: "closed", name: "Closed", color: "#6b7280" },
  projects: [{ key: "TF", name: "Taskflow", color: "#df6807" }],
  isRoot: false,
};

import TaskDependenciesView from "./TaskDependenciesView.vue";

async function mountView(view: "graph" | "table" = "graph") {
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
        path: "/tasks/:flow/:taskId/dependencies",
        redirect: (to) => ({
          name: "task-dependencies",
          params: { ...to.params, view: "graph" },
        }),
      },
      {
        path: "/tasks/:flow/:taskId/dependencies/:view(graph|table)",
        name: "task-dependencies",
        component: TaskDependenciesView,
      },
    ],
  });
  router.push(`/tasks/feature/root-id/dependencies/${view}`);
  await router.isReady();
  const wrapper = mount(TaskDependenciesView, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  getTaskGraph.mockReset();
  lastFlowProps.value = null;
  flowEmit.value = null;
});

describe("TaskDependenciesView", () => {
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

    // Root node visually distinguished by a thicker top/right/bottom border.
    const rootNode = lastFlowProps.value!.nodes.find((n) => n.id === ROOT.id)!;
    expect(rootNode.style.borderTop).toContain("2px");

    // Closed node dimmed.
    const childNode = lastFlowProps.value!.nodes.find((n) => n.id === CHILD.id)!;
    expect(childNode.style.opacity).toBeLessThan(1);

    // Status color rendered as a left-edge stripe on each node.
    expect(rootNode.style.borderLeft).toContain("#f59e0b");
    expect(childNode.style.borderLeft).toContain("#6b7280");
    // Status name surfaced in the node label so users can read it.
    expect(rootNode.label).toContain("Implement");
    expect(childNode.label).toContain("Closed");

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

  it("titles the view 'Dependencies' rather than 'graph'", async () => {
    getTaskGraph.mockResolvedValueOnce({ nodes: [ROOT, CHILD], edges: [] });
    const { wrapper } = await mountView();
    expect(wrapper.get("h2").text()).toBe("Dependencies");
  });

  it("renders the table directly when the route is the table sub-view", async () => {
    getTaskGraph.mockResolvedValueOnce({
      nodes: [ROOT, CHILD],
      edges: [{ from: ROOT.id, to: CHILD.id, type: "blocker" }],
    });
    const { wrapper } = await mountView("table");

    expect(wrapper.find('[data-testid="graph-table"]').exists()).toBe(true);
    // The table tab is marked active, reflecting the route-driven mode.
    expect(wrapper.get('[data-testid="graph-mode-table"]').classes()).toContain(
      "graph-view__mode-btn--active",
    );
    expect(
      wrapper.get('[data-testid="graph-mode-diagram"]').classes(),
    ).not.toContain("graph-view__mode-btn--active");
  });

  it("drives the view from the route and switches via the toggle nav links", async () => {
    getTaskGraph.mockResolvedValue({
      nodes: [ROOT, CHILD],
      edges: [{ from: ROOT.id, to: CHILD.id, type: "blocker" }],
    });
    const { wrapper, router } = await mountView("graph");

    // Graph sub-view → diagram visible, table absent.
    expect(wrapper.find('[data-testid="vue-flow-stub"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="graph-table"]').exists()).toBe(false);

    // The toggle entries are links pointing at the dedicated URLs.
    const tableTab = wrapper.get('[data-testid="graph-mode-table"]');
    expect(tableTab.element.tagName).toBe("A");
    expect(tableTab.attributes("href")).toContain(
      "/tasks/feature/root-id/dependencies/table",
    );

    // Clicking the table tab navigates to its URL and renders the table.
    await tableTab.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toContain("/dependencies/table");
    expect(wrapper.find('[data-testid="graph-table"]').exists()).toBe(true);

    // And the diagram tab navigates back.
    await wrapper.get('[data-testid="graph-mode-diagram"]').trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.fullPath).toContain("/dependencies/graph");
    expect(wrapper.find('[data-testid="graph-table"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="vue-flow-stub"]').exists()).toBe(true);
  });
});
