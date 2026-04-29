import { Prisma } from "@prisma/client";
import { prisma } from "../prisma-client.js";

export class TaskDependencyError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

const blockerSelect = {
  id: true,
  displayId: true,
  title: true,
  flow: { select: { slug: true, name: true } },
  currentStatus: { select: { slug: true, name: true } },
} as const;

export async function addBlocker(input: {
  taskId: string;
  blockingTaskId: string;
  createdBy: string;
  taskVisibilityWhere: Record<string, unknown>;
}) {
  if (input.taskId === input.blockingTaskId) {
    throw new TaskDependencyError(
      "SELF_BLOCKER_NOT_ALLOWED",
      "A task cannot block itself",
      400,
    );
  }

  const blockedTask = await prisma.task.findFirst({
    where: { id: input.taskId, isDeleted: false, ...input.taskVisibilityWhere },
    select: { id: true },
  });
  if (!blockedTask) {
    throw new TaskDependencyError("NOT_FOUND", "Task not found", 404);
  }

  const blockingTask = await prisma.task.findFirst({
    where: { id: input.blockingTaskId, isDeleted: false, ...input.taskVisibilityWhere },
    select: { id: true },
  });
  if (!blockingTask) {
    throw new TaskDependencyError(
      "BLOCKING_TASK_NOT_FOUND",
      "Blocking task not found",
      404,
    );
  }

  // Pair-cycle check: B already blocks A → reject A blocking B.
  const reverse = await prisma.taskDependency.findUnique({
    where: {
      blockingTaskId_blockedTaskId: {
        blockingTaskId: input.taskId,
        blockedTaskId: input.blockingTaskId,
      },
    },
    select: { id: true },
  });
  if (reverse) {
    throw new TaskDependencyError(
      "CYCLIC_BLOCKER",
      "Adding this blocker would create a direct cycle",
      409,
    );
  }

  try {
    const dep = await prisma.taskDependency.create({
      data: {
        blockedTaskId: input.taskId,
        blockingTaskId: input.blockingTaskId,
        createdBy: input.createdBy,
      },
      include: { blockingTask: { select: blockerSelect } },
    });
    return dep.blockingTask;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new TaskDependencyError(
        "BLOCKER_ALREADY_EXISTS",
        "This blocker already exists",
        409,
      );
    }
    throw err;
  }
}

export async function removeBlocker(input: {
  taskId: string;
  blockingTaskId: string;
  taskVisibilityWhere: Record<string, unknown>;
}) {
  const blockedTask = await prisma.task.findFirst({
    where: { id: input.taskId, isDeleted: false, ...input.taskVisibilityWhere },
    select: { id: true },
  });
  if (!blockedTask) {
    throw new TaskDependencyError("NOT_FOUND", "Task not found", 404);
  }

  const result = await prisma.taskDependency.deleteMany({
    where: { blockedTaskId: input.taskId, blockingTaskId: input.blockingTaskId },
  });
  if (result.count === 0) {
    throw new TaskDependencyError("NOT_FOUND", "Blocker not found", 404);
  }
}

export async function listForTask(input: {
  taskId: string;
  taskVisibilityWhere: Record<string, unknown>;
}) {
  const task = await prisma.task.findFirst({
    where: { id: input.taskId, isDeleted: false, ...input.taskVisibilityWhere },
    select: { id: true },
  });
  if (!task) {
    throw new TaskDependencyError("NOT_FOUND", "Task not found", 404);
  }

  const [blockers, blocking] = await Promise.all([
    prisma.taskDependency.findMany({
      where: { blockedTaskId: input.taskId, blockingTask: { isDeleted: false } },
      include: { blockingTask: { select: blockerSelect } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.taskDependency.findMany({
      where: { blockingTaskId: input.taskId, blockedTask: { isDeleted: false } },
      include: { blockedTask: { select: blockerSelect } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return {
    blockers: blockers.map((d) => d.blockingTask),
    blocking: blocking.map((d) => d.blockedTask),
  };
}

export async function getBlockerCounts(taskId: string) {
  const [total, open] = await Promise.all([
    prisma.taskDependency.count({
      where: { blockedTaskId: taskId, blockingTask: { isDeleted: false } },
    }),
    prisma.taskDependency.count({
      where: {
        blockedTaskId: taskId,
        blockingTask: {
          isDeleted: false,
          currentStatus: { slug: { not: "closed" } },
        },
      },
    }),
  ]);
  return { blockerCount: total, openBlockerCount: open };
}
