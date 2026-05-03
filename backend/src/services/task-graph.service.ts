import { prisma } from "../prisma-client.js";

export class TaskGraphError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

export type GraphEdgeType = "spawn" | "blocker";

export interface GraphNode {
  id: string;
  displayId: string;
  title: string;
  flow: { slug: string; name: string };
  currentStatus: { slug: string; name: string };
  isRoot: boolean;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: GraphEdgeType;
}

export interface TaskGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated?: boolean;
}

const MAX_NODES = 500;

const nodeSelect = {
  id: true,
  displayId: true,
  title: true,
  spawnedFromTaskId: true,
  flow: { select: { slug: true, name: true } },
  currentStatus: { select: { slug: true, name: true } },
} as const;

export async function buildTaskGraph(input: {
  rootTaskId: string;
  taskVisibilityWhere: Record<string, unknown>;
}): Promise<TaskGraph> {
  const root = await prisma.task.findFirst({
    where: { id: input.rootTaskId, isDeleted: false, ...input.taskVisibilityWhere },
    select: nodeSelect,
  });
  if (!root) {
    throw new TaskGraphError("NOT_FOUND", "Task not found", 404);
  }

  const visibilityFilter = { isDeleted: false, ...input.taskVisibilityWhere };

  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const edgeKeys = new Set<string>();

  type RawNode = NonNullable<typeof root>;
  function addNode(t: RawNode, isRoot: boolean) {
    if (nodes.has(t.id)) return;
    nodes.set(t.id, {
      id: t.id,
      displayId: t.displayId,
      title: t.title,
      flow: t.flow,
      currentStatus: t.currentStatus,
      isRoot,
    });
  }

  function addEdge(from: string, to: string, type: GraphEdgeType) {
    const key = `${type}:${from}->${to}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from, to, type });
  }

  addNode(root, true);

  const queue: string[] = [root.id];
  let truncated = false;

  while (queue.length > 0) {
    if (nodes.size >= MAX_NODES) {
      truncated = true;
      break;
    }
    const currentId = queue.shift()!;

    const currentSpawnedFromId =
      currentId === root.id
        ? root.spawnedFromTaskId
        : await prisma.task
            .findUnique({ where: { id: currentId }, select: { spawnedFromTaskId: true } })
            .then((r) => r?.spawnedFromTaskId ?? null);

    const [parent, children, blockers, blocked] = await Promise.all([
      currentSpawnedFromId
        ? prisma.task.findFirst({
            where: { id: currentSpawnedFromId, ...visibilityFilter },
            select: nodeSelect,
          })
        : Promise.resolve(null),
      prisma.task.findMany({
        where: { spawnedFromTaskId: currentId, ...visibilityFilter },
        select: nodeSelect,
      }),
      prisma.taskDependency.findMany({
        where: {
          blockedTaskId: currentId,
          blockingTask: visibilityFilter,
        },
        include: { blockingTask: { select: nodeSelect } },
      }),
      prisma.taskDependency.findMany({
        where: {
          blockingTaskId: currentId,
          blockedTask: visibilityFilter,
        },
        include: { blockedTask: { select: nodeSelect } },
      }),
    ]);

    if (parent) {
      const seen = nodes.has(parent.id);
      addNode(parent, false);
      addEdge(parent.id, currentId, "spawn");
      if (!seen) queue.push(parent.id);
    }

    for (const child of children) {
      const seen = nodes.has(child.id);
      addNode(child, false);
      addEdge(currentId, child.id, "spawn");
      if (!seen) queue.push(child.id);
    }

    for (const dep of blockers) {
      const t = dep.blockingTask;
      const seen = nodes.has(t.id);
      addNode(t, false);
      addEdge(t.id, currentId, "blocker");
      if (!seen) queue.push(t.id);
    }

    for (const dep of blocked) {
      const t = dep.blockedTask;
      const seen = nodes.has(t.id);
      addNode(t, false);
      addEdge(currentId, t.id, "blocker");
      if (!seen) queue.push(t.id);
    }
  }

  const result: TaskGraph = {
    nodes: Array.from(nodes.values()),
    edges,
  };
  if (truncated) result.truncated = true;
  return result;
}
