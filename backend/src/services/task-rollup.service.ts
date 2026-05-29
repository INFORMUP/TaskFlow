import { prisma } from "../prisma-client.js";

// Child-completion roll-up for a task: how many direct, non-deleted children it
// has and how many of those sit in a terminal status (any terminal counts as
// "done", regardless of resolution). Computed on read — nothing is persisted.
export interface ChildRollup {
  childCount: number;
  childDoneCount: number;
}

export type MilestoneDerivedStatus = "not_started" | "in_progress" | "complete";

const ZERO_ROLLUP: ChildRollup = { childCount: 0, childDoneCount: 0 };

export function emptyRollup(): ChildRollup {
  return { ...ZERO_ROLLUP };
}

// Batched roll-up for a page of tasks. Two grouped counts (total children, done
// children) over the whole id set, avoiding an N+1 across the list. Every input
// id is present in the returned map (zeroed if it has no children).
export async function getChildRollups(taskIds: string[]): Promise<Map<string, ChildRollup>> {
  const map = new Map<string, ChildRollup>();
  for (const id of taskIds) map.set(id, emptyRollup());
  if (taskIds.length === 0) return map;

  const [totals, dones] = await Promise.all([
    prisma.task.groupBy({
      by: ["spawnedFromTaskId"],
      where: { spawnedFromTaskId: { in: taskIds }, isDeleted: false },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ["spawnedFromTaskId"],
      where: {
        spawnedFromTaskId: { in: taskIds },
        isDeleted: false,
        currentStatus: { isTerminal: true },
      },
      _count: { _all: true },
    }),
  ]);

  for (const row of totals) {
    if (row.spawnedFromTaskId) {
      map.get(row.spawnedFromTaskId)!.childCount = row._count._all;
    }
  }
  for (const row of dones) {
    if (row.spawnedFromTaskId) {
      map.get(row.spawnedFromTaskId)!.childDoneCount = row._count._all;
    }
  }
  return map;
}

// Convenience for single-task responses (detail, create, patch).
export async function getChildRollup(taskId: string): Promise<ChildRollup> {
  const map = await getChildRollups([taskId]);
  return map.get(taskId) ?? emptyRollup();
}

// Milestone status is derived from the child-completion ratio. A manual close
// (the milestone's own status being terminal) overrides the derivation and
// always reads as complete.
export function deriveMilestoneStatus(
  rollup: ChildRollup,
  ownStatusIsTerminal: boolean
): MilestoneDerivedStatus {
  if (ownStatusIsTerminal) return "complete";
  const { childCount, childDoneCount } = rollup;
  if (childCount === 0 || childDoneCount === 0) return "not_started";
  if (childDoneCount >= childCount) return "complete";
  return "in_progress";
}
