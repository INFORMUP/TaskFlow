import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createRouter, createMemoryHistory, type Router } from "vue-router";
import TaskGraphTable from "./TaskGraphTable.vue";
import StatusBadge from "@/components/visual/StatusBadge.vue";
import type { TaskGraphNode, TaskGraphResponse } from "@/api/tasks.api";

function withStatus(
  n: TaskGraphNode,
  slug: string,
  name: string,
  color: string,
): TaskGraphNode {
  n.currentStatus = { slug, name, color };
  return n;
}

function node(
  id: string,
  displayId: string,
  statusSlug = "implement",
  isRoot = false,
): TaskGraphNode {
  return {
    id,
    displayId,
    title: `Task ${displayId}`,
    flow: { slug: "feature", name: "Feature" },
    currentStatus: { slug: statusSlug, name: statusSlug, color: "#123456" },
    projects: [{ key: "TF", name: "Taskflow", color: "#df6807" }],
    isRoot,
  };
}

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div/>" } },
      {
        path: "/tasks/:flow/:taskId",
        name: "task-detail",
        component: { template: "<div/>" },
      },
    ],
  });
}

async function mountTable(graph: TaskGraphResponse) {
  const router = makeRouter();
  router.push("/");
  await router.isReady();
  return mount(TaskGraphTable, {
    props: { graph },
    global: { plugins: [router] },
  });
}

describe("TaskGraphTable", () => {
  it("renders one row per node in topological order", async () => {
    const a = node("a", "FEAT-1", "implement", true);
    const b = node("b", "FEAT-2");
    const c = node("c", "FEAT-3");
    const wrapper = await mountTable({
      nodes: [c, b, a],
      edges: [
        { from: "a", to: "b", type: "blocker" },
        { from: "b", to: "c", type: "blocker" },
      ],
    });
    const rows = wrapper.findAll('[data-testid="graph-row"]');
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.attributes("data-display-id"))).toEqual([
      "FEAT-1",
      "FEAT-2",
      "FEAT-3",
    ]);
  });

  it("flags the ready row (open with all blockers closed)", async () => {
    const blocker = node("blk", "FEAT-1", "closed");
    const target = node("tgt", "FEAT-2", "implement");
    const wrapper = await mountTable({
      nodes: [blocker, target],
      edges: [{ from: "blk", to: "tgt", type: "blocker" }],
    });
    const targetRow = wrapper.get('[data-display-id="FEAT-2"]');
    expect(targetRow.attributes("data-ready")).toBe("true");
    const blockerRow = wrapper.get('[data-display-id="FEAT-1"]');
    expect(blockerRow.attributes("data-ready")).toBe("false");
  });

  it("lists blocked-by and blocks references with links", async () => {
    const a = node("a", "FEAT-1");
    const b = node("b", "FEAT-2");
    const wrapper = await mountTable({
      nodes: [a, b],
      edges: [{ from: "a", to: "b", type: "blocker" }],
    });
    const rowB = wrapper.get('[data-display-id="FEAT-2"]');
    expect(rowB.get('[data-testid="row-blocked-by"]').text()).toContain("FEAT-1");
    const rowA = wrapper.get('[data-display-id="FEAT-1"]');
    expect(rowA.get('[data-testid="row-blocks"]').text()).toContain("FEAT-2");
  });

  it("renders project chips for each row", async () => {
    const wrapper = await mountTable({ nodes: [node("a", "FEAT-1")], edges: [] });
    expect(wrapper.get('[data-display-id="FEAT-1"]').text()).toContain("TF");
  });

  it("links non-root display ids to task detail but renders the root as plain text", async () => {
    const root = node("a", "FEAT-1", "implement", true);
    const child = node("b", "FEAT-2");
    const wrapper = await mountTable({
      nodes: [root, child],
      edges: [{ from: "a", to: "b", type: "spawn" }],
    });
    const childLink = wrapper
      .get('[data-display-id="FEAT-2"]')
      .find('a[href="/tasks/feature/b"]');
    expect(childLink.exists()).toBe(true);
    // Root id should not be a navigating link.
    const rootRow = wrapper.get('[data-display-id="FEAT-1"]');
    expect(rootRow.find('a[href="/tasks/feature/a"]').exists()).toBe(false);
  });

  it("renders each blocked and blocking task on its own line", async () => {
    const a = withStatus(node("a", "FEAT-1", "design"), "design", "Design", "#004de6");
    const b = withStatus(
      node("b", "FEAT-2", "implement"),
      "implement",
      "Implement",
      "#f06000",
    );
    const c = withStatus(node("c", "FEAT-3", "closed"), "closed", "Closed", "#10b981");
    // FEAT-1 blocks both FEAT-2 and FEAT-3.
    const wrapper = await mountTable({
      nodes: [a, b, c],
      edges: [
        { from: "a", to: "b", type: "blocker" },
        { from: "a", to: "c", type: "blocker" },
      ],
    });
    const blocksCell = wrapper
      .get('[data-display-id="FEAT-1"]')
      .get('[data-testid="row-blocks"]');
    const lines = blocksCell.findAll('[data-testid="ref-line"]');
    expect(lines).toHaveLength(2);
    // Sorted by display id: FEAT-2 then FEAT-3, each with its stage inline.
    expect(lines[0].text()).toContain("FEAT-2");
    expect(lines[0].text()).toContain("Implement");
    expect(lines[1].text()).toContain("FEAT-3");
    expect(lines[1].text()).toContain("Closed");
  });

  it("shows each referenced task's stage with status coloration in both columns", async () => {
    const a = withStatus(node("a", "FEAT-1", "design"), "design", "Design", "#004de6");
    const b = withStatus(
      node("b", "FEAT-2", "implement"),
      "implement",
      "Implement",
      "#f06000",
    );
    const wrapper = await mountTable({
      nodes: [a, b],
      edges: [{ from: "a", to: "b", type: "blocker" }],
    });
    // "Blocked by" on FEAT-2 surfaces FEAT-1's stage + color.
    const blockedByBadges = wrapper
      .get('[data-display-id="FEAT-2"]')
      .get('[data-testid="row-blocked-by"]')
      .findAllComponents(StatusBadge);
    expect(blockedByBadges).toHaveLength(1);
    expect(blockedByBadges[0].props("name")).toBe("Design");
    expect(blockedByBadges[0].props("color")).toBe("#004de6");
    // "Blocks" on FEAT-1 surfaces FEAT-2's stage + color.
    const blocksBadges = wrapper
      .get('[data-display-id="FEAT-1"]')
      .get('[data-testid="row-blocks"]')
      .findAllComponents(StatusBadge);
    expect(blocksBadges).toHaveLength(1);
    expect(blocksBadges[0].props("name")).toBe("Implement");
    expect(blocksBadges[0].props("color")).toBe("#f06000");
  });

  it("keeps the display id a navigating link on each ref line", async () => {
    const a = node("a", "FEAT-1");
    const b = node("b", "FEAT-2");
    const wrapper = await mountTable({
      nodes: [a, b],
      edges: [{ from: "a", to: "b", type: "blocker" }],
    });
    const link = wrapper
      .get('[data-display-id="FEAT-1"]')
      .get('[data-testid="row-blocks"]')
      .find('a[href="/tasks/feature/b"]');
    expect(link.exists()).toBe(true);
    expect(link.text()).toBe("FEAT-2");
  });

  it("renders an em dash and no ref lines for empty blocks/blocked-by cells", async () => {
    const wrapper = await mountTable({ nodes: [node("a", "FEAT-1")], edges: [] });
    const row = wrapper.get('[data-display-id="FEAT-1"]');
    const blocks = row.get('[data-testid="row-blocks"]');
    const blockedBy = row.get('[data-testid="row-blocked-by"]');
    expect(blocks.text()).toContain("—");
    expect(blockedBy.text()).toContain("—");
    expect(blocks.findAll('[data-testid="ref-line"]')).toHaveLength(0);
    expect(blockedBy.findAll('[data-testid="ref-line"]')).toHaveLength(0);
  });

  it("dims closed rows", async () => {
    const wrapper = await mountTable({
      nodes: [node("a", "FEAT-1", "closed")],
      edges: [],
    });
    expect(wrapper.get('[data-display-id="FEAT-1"]').attributes("data-closed")).toBe(
      "true",
    );
  });
});
