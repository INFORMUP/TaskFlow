import { prisma } from "../prisma-client.js";

const FLOW_PREFIXES: Record<string, string> = {
  bug: "BUG",
  feature: "FEAT",
  improvement: "IMP",
  "grant-application": "GRNT",
  "donor-outreach": "OUTR",
  event: "EVNT",
};

export async function generateDisplayId(flowSlug: string): Promise<string> {
  const prefix = FLOW_PREFIXES[flowSlug];
  if (!prefix) throw new Error(`Unknown flow: ${flowSlug}`);

  const flow = await prisma.flow.findFirst({ where: { slug: flowSlug } });
  if (!flow) throw new Error(`Flow not found: ${flowSlug}`);

  // Find highest existing display_id number for this flow
  const lastTask = await prisma.task.findFirst({
    where: { displayId: { startsWith: `${prefix}-` } },
    orderBy: { createdAt: "desc" },
  });

  let nextNum = 1;
  if (lastTask) {
    const parts = lastTask.displayId.split("-");
    nextNum = parseInt(parts[1], 10) + 1;
  }

  return `${prefix}-${nextNum}`;
}

export async function getInitialStatus(flowId: string) {
  return prisma.flowStatus.findFirst({
    where: { flowId },
    orderBy: { sortOrder: "asc" },
  });
}

interface CreateTaskInput {
  flowSlug: string;
  title: string;
  description?: string;
  priority: string;
  createdBy: string;
  actorType: string;
  assigneeUserId?: string | null;
  projectIds?: string[];
  dueDate?: string | Date | null;
}

export class TaskServiceError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export async function createTask(input: CreateTaskInput) {
  const flow = await prisma.flow.findFirst({ where: { slug: input.flowSlug } });
  if (!flow) return null;

  const initialStatus = await getInitialStatus(flow.id);
  if (!initialStatus) throw new Error(`No statuses for flow: ${input.flowSlug}`);

  const projectIds = input.projectIds ?? [];
  if (projectIds.length > 0) {
    const found = await prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true },
    });
    if (found.length !== projectIds.length) {
      throw new TaskServiceError("INVALID_PROJECT", "One or more projects do not exist", 422);
    }

    // Union-membership rule: flow must be attached to at least one of the selected projects.
    const match = await prisma.projectFlow.findFirst({
      where: { projectId: { in: projectIds }, flowId: flow.id },
      select: { projectId: true },
    });
    if (!match) {
      throw new TaskServiceError(
        "FLOW_NOT_IN_PROJECTS",
        "Flow is not attached to any of the selected projects",
        422,
      );
    }
  }

  let assigneeId = input.assigneeUserId ?? null;
  if (!assigneeId && projectIds.length > 0) {
    const firstProject = await prisma.project.findUnique({
      where: { id: projectIds[0] },
      select: { defaultAssigneeUserId: true },
    });
    assigneeId = firstProject?.defaultAssigneeUserId ?? null;
  }

  const displayId = await generateDisplayId(input.flowSlug);
  const dueDate = input.dueDate
    ? typeof input.dueDate === "string"
      ? new Date(input.dueDate)
      : input.dueDate
    : null;

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        displayId,
        flowId: flow.id,
        currentStatusId: initialStatus.id,
        title: input.title,
        description: input.description ?? null,
        priority: input.priority,
        createdBy: input.createdBy,
        assigneeId,
        dueDate,
      },
      include: taskInclude,
    });

    if (projectIds.length > 0) {
      await tx.taskProject.createMany({
        data: projectIds.map((projectId) => ({ taskId: task.id, projectId })),
        skipDuplicates: true,
      });
    }

    await tx.taskTransition.create({
      data: {
        taskId: task.id,
        fromStatusId: null,
        toStatusId: initialStatus.id,
        actorId: input.createdBy,
        note: "Task created",
        actorType: input.actorType,
      },
    });

    return tx.task.findUnique({ where: { id: task.id }, include: taskInclude });
  });
}

export const taskInclude = {
  flow: true,
  currentStatus: true,
  creator: { select: { id: true, displayName: true, actorType: true } },
  assignee: { select: { id: true, displayName: true, actorType: true } },
  projects: {
    include: {
      project: {
        select: {
          id: true,
          key: true,
          name: true,
          ownerUserId: true,
          owner: { select: { id: true, displayName: true, actorType: true } },
        },
      },
    },
  },
} as const;

export async function addProjectToTask(taskId: string, projectId: string) {
  const [task, project] = await Promise.all([
    prisma.task.findUnique({ where: { id: taskId } }),
    prisma.project.findUnique({ where: { id: projectId } }),
  ]);
  if (!task) throw new TaskServiceError("NOT_FOUND", "Task not found", 404);
  if (!project) throw new TaskServiceError("INVALID_PROJECT", "Project not found", 422);

  await prisma.taskProject.upsert({
    where: { taskId_projectId: { taskId, projectId } },
    update: {},
    create: { taskId, projectId },
  });
}

export async function removeProjectFromTask(taskId: string, projectId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { projects: true },
  });
  if (!task) throw new TaskServiceError("NOT_FOUND", "Task not found", 404);
  if (task.projects.length <= 1) {
    throw new TaskServiceError(
      "LAST_PROJECT",
      "Cannot remove the last project from a task",
      400,
    );
  }

  // Guard: the task's current flow must still be reachable through at least one
  // remaining project after the removal.
  const remainingProjectIds = task.projects
    .map((tp) => tp.projectId)
    .filter((id) => id !== projectId);
  const reachable = await prisma.projectFlow.findFirst({
    where: { projectId: { in: remainingProjectIds }, flowId: task.flowId },
    select: { projectId: true },
  });
  if (!reachable) {
    throw new TaskServiceError(
      "FLOW_UNREACHABLE",
      "Removing this project would leave the task's flow unreachable",
      400,
    );
  }

  await prisma.taskProject.deleteMany({ where: { taskId, projectId } });
}
