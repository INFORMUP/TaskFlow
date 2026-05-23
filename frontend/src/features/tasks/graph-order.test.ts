import { describe, it, expect } from "vitest";
import { orderGraph } from "./graph-order";
import type { TaskGraphNode, TaskGraphResponse } from "@/api/tasks.api";

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
    currentStatus: { slug: statusSlug, name: statusSlug, color: "#000" },
    projects: [{ key: "TF", name: "Taskflow", color: "#df6807" }],
    isRoot,
  };
}

function graph(
  nodes: TaskGraphNode[],
  edges: TaskGraphResponse["edges"] = [],
  truncated?: boolean,
): TaskGraphResponse {
  return { nodes, edges, ...(truncated ? { truncated } : {}) };
}

describe("orderGraph", () => {
  it("orders a linear blocker chain topologically (blockers first)", () => {
    // A blocks B, B blocks C  =>  order A, B, C with ascending ranks
    const a = node("a", "FEAT-1");
    const b = node("b", "FEAT-2");
    const c = node("c", "FEAT-3");
    const rows = orderGraph(
      graph(
        [c, a, b], // intentionally unsorted input
        [
          { from: "a", to: "b", type: "blocker" },
          { from: "b", to: "c", type: "blocker" },
        ],
      ),
    );

    expect(rows.map((r) => r.node.id)).toEqual(["a", "b", "c"]);
    expect(rows.map((r) => r.rank)).toEqual([0, 1, 2]);
  });

  it("breaks ties within a rank by display id (numeric-aware)", () => {
    // No edges => all rank 0; FEAT-2 must come before FEAT-10.
    const rows = orderGraph(
      graph([node("x", "FEAT-10"), node("y", "FEAT-2"), node("z", "FEAT-1")]),
    );
    expect(rows.map((r) => r.node.displayId)).toEqual([
      "FEAT-1",
      "FEAT-2",
      "FEAT-10",
    ]);
    expect(rows.every((r) => r.rank === 0)).toBe(true);
  });

  it("resolves blockedBy and blocks references", () => {
    const a = node("a", "FEAT-1");
    const b = node("b", "FEAT-2");
    const rows = orderGraph(
      graph([a, b], [{ from: "a", to: "b", type: "blocker" }]),
    );
    const rowA = rows.find((r) => r.node.id === "a")!;
    const rowB = rows.find((r) => r.node.id === "b")!;
    expect(rowA.blocks.map((n) => n.id)).toEqual(["b"]);
    expect(rowA.blockedBy).toEqual([]);
    expect(rowB.blockedBy.map((n) => n.id)).toEqual(["a"]);
    expect(rowB.blocks).toEqual([]);
  });

  it("ignores spawn edges for ordering but keeps spawn-only nodes at rank 0", () => {
    const epic = node("epic", "FEAT-1");
    const child = node("child", "FEAT-2");
    const rows = orderGraph(
      graph([epic, child], [{ from: "epic", to: "child", type: "spawn" }]),
    );
    expect(rows.every((r) => r.rank === 0)).toBe(true);
    expect(rows.every((r) => r.blockedBy.length === 0)).toBe(true);
  });

  it("marks a row ready when it is open and all blockers are closed", () => {
    const blocker = node("blk", "FEAT-1", "closed");
    const target = node("tgt", "FEAT-2", "implement");
    const rows = orderGraph(
      graph([blocker, target], [{ from: "blk", to: "tgt", type: "blocker" }]),
    );
    const rowTarget = rows.find((r) => r.node.id === "tgt")!;
    expect(rowTarget.ready).toBe(true);
  });

  it("does not mark a row ready when a blocker is still open", () => {
    const blocker = node("blk", "FEAT-1", "implement");
    const target = node("tgt", "FEAT-2", "implement");
    const rows = orderGraph(
      graph([blocker, target], [{ from: "blk", to: "tgt", type: "blocker" }]),
    );
    expect(rows.find((r) => r.node.id === "tgt")!.ready).toBe(false);
  });

  it("treats an unblocked open task as ready and a closed task as not ready", () => {
    const open = node("o", "FEAT-1", "implement");
    const closed = node("c", "FEAT-2", "closed");
    const rows = orderGraph(graph([open, closed]));
    expect(rows.find((r) => r.node.id === "o")!.ready).toBe(true);
    expect(rows.find((r) => r.node.id === "c")!.ready).toBe(false);
  });

  it("renders all nodes without looping on a blocker cycle and flags them", () => {
    // A blocks B, B blocks C, C blocks A (3-cycle)
    const a = node("a", "FEAT-1");
    const b = node("b", "FEAT-2");
    const c = node("c", "FEAT-3");
    const rows = orderGraph(
      graph(
        [a, b, c],
        [
          { from: "a", to: "b", type: "blocker" },
          { from: "b", to: "c", type: "blocker" },
          { from: "c", to: "a", type: "blocker" },
        ],
      ),
    );
    expect(rows.map((r) => r.node.id).sort()).toEqual(["a", "b", "c"]);
    expect(rows.every((r) => r.inCycle)).toBe(true);
  });

  it("places cycle nodes after all acyclic ranked nodes", () => {
    // standalone D (rank 0) plus a 2-cycle A<->B
    const d = node("d", "FEAT-9");
    const a = node("a", "FEAT-1");
    const b = node("b", "FEAT-2");
    const rows = orderGraph(
      graph(
        [a, b, d],
        [
          { from: "a", to: "b", type: "blocker" },
          { from: "b", to: "a", type: "blocker" },
        ],
      ),
    );
    expect(rows[0].node.id).toBe("d");
    expect(rows.slice(1).every((r) => r.inCycle)).toBe(true);
  });
});
