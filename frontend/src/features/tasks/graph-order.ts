import type { TaskGraphNode, TaskGraphResponse } from "@/api/tasks.api";

export interface OrderedRow {
  node: TaskGraphNode;
  /** Topological layer over blocker edges (0 = no blockers). Cycle nodes get the deepest rank + 1. */
  rank: number;
  /** Tasks that block this row (resolved nodes), sorted by display id. */
  blockedBy: TaskGraphNode[];
  /** Tasks this row blocks (resolved nodes), sorted by display id. */
  blocks: TaskGraphNode[];
  /** Open task whose blockers are all closed (or has none) = unblocked work to pick up next. */
  ready: boolean;
  /** Could not be ranked via Kahn — part of a blocker cycle. */
  inCycle: boolean;
}

const CLOSED = "closed";

function byDisplayId(a: TaskGraphNode, b: TaskGraphNode): number {
  return a.displayId.localeCompare(b.displayId, undefined, { numeric: true });
}

/**
 * Turn a task graph payload into dependency-ordered table rows.
 *
 * Ordering is a layered Kahn topological sort over **blocker** edges only
 * (`edge.from` blocks `edge.to`): a task always appears after every task that
 * blocks it. Within a layer, ties break by display id. Spawn edges are ignored
 * for ordering, so spawn-only nodes land at rank 0. Nodes caught in a blocker
 * cycle (Kahn can't drain them) are appended after all ranked nodes, ordered by
 * display id, and flagged `inCycle` — defensive against cycles the write API
 * may not have rejected.
 */
export function orderGraph(graph: TaskGraphResponse): OrderedRow[] {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));

  const blockedBy = new Map<string, string[]>();
  const blocks = new Map<string, string[]>();
  for (const n of graph.nodes) {
    blockedBy.set(n.id, []);
    blocks.set(n.id, []);
  }
  for (const e of graph.edges) {
    if (e.type !== "blocker") continue;
    if (!nodeById.has(e.from) || !nodeById.has(e.to)) continue;
    blocks.get(e.from)!.push(e.to);
    blockedBy.get(e.to)!.push(e.from);
  }

  // Layered Kahn over blocker edges.
  const indegree = new Map<string, number>();
  for (const n of graph.nodes) indegree.set(n.id, blockedBy.get(n.id)!.length);

  const rank = new Map<string, number>();
  let frontier = graph.nodes.filter((n) => indegree.get(n.id) === 0);
  let currentRank = 0;
  while (frontier.length > 0) {
    for (const n of frontier) rank.set(n.id, currentRank);
    const next: TaskGraphNode[] = [];
    for (const n of frontier) {
      for (const childId of blocks.get(n.id)!) {
        indegree.set(childId, indegree.get(childId)! - 1);
        if (indegree.get(childId) === 0) next.push(nodeById.get(childId)!);
      }
    }
    frontier = next;
    currentRank += 1;
  }

  // Anything left unranked is part of a cycle; park it after the deepest rank.
  const cycleRank = currentRank;
  const rows: OrderedRow[] = graph.nodes.map((node) => {
    const inCycle = !rank.has(node.id);
    const resolvedBlockedBy = blockedBy
      .get(node.id)!
      .map((id) => nodeById.get(id)!)
      .sort(byDisplayId);
    const resolvedBlocks = blocks
      .get(node.id)!
      .map((id) => nodeById.get(id)!)
      .sort(byDisplayId);
    const ready =
      node.currentStatus.slug !== CLOSED &&
      resolvedBlockedBy.every((b) => b.currentStatus.slug === CLOSED);
    return {
      node,
      rank: inCycle ? cycleRank : rank.get(node.id)!,
      blockedBy: resolvedBlockedBy,
      blocks: resolvedBlocks,
      ready,
      inCycle,
    };
  });

  rows.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return byDisplayId(a.node, b.node);
  });
  return rows;
}
