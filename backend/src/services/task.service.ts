import { Prisma } from "@prisma/client";
import { prisma } from "../prisma-client.js";

type PrismaClientLike = Prisma.TransactionClient | typeof prisma;

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

interface ResolveDefaultAssigneeInput {
  flowStatusId: string;
  projectId?: string | null;
  taskId?: string | null;
}

async function isValidProjectAssignee(
  client: PrismaClientLike,
  projectId: string,
  userId: string,
): Promise<boolean> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { status: true },
  });
  if (!user || user.status !== "active") return false;
  const membership = await client.projectTeam.findFirst({
    where: { projectId, team: { members: { some: { userId } } } },
    select: { teamId: true },
  });
  return !!membership;
}

export async function resolveDefaultAssignee(
  input: ResolveDefaultAssigneeInput,
  client: PrismaClientLike = prisma,
): Promise<string | null> {
  let projectId = input.projectId ?? null;

  if (!projectId && input.taskId) {
    const first = await client.taskProject.findFirst({
      where: { taskId: input.taskId },
      orderBy: [{ createdAt: "asc" }, { projectId: "asc" }],
      select: { projectId: true },
    });
    projectId = first?.projectId ?? null;
  }

  if (!projectId) return null;

  const statusDefault = await client.projectStatusDefaultAssignee.findUnique({
    where: {
      projectId_flowStatusId: { projectId, flowStatusId: input.flowStatusId },
    },
    select: { userId: true },
  });
  if (statusDefault && (await isValidProjectAssignee(client, projectId, statusDefault.userId))) {
    return statusDefault.userId;
  }

  const project = await client.project.findUnique({
    where: { id: projectId },
    select: { defaultAssigneeUserId: true },
  });
  const projectDefault = project?.defaultAssigneeUserId ?? null;
  if (projectDefault && (await isValidProjectAssignee(client, projectId, projectDefault))) {
    return projectDefault;
  }
  return null;
}

interface CreateTaskInput {
  orgId: string;
  flowSlug: string;
  title: string;
  description?: string;
  priority: string;
  createdBy: string;
  actorType: string;
  assigneeUserId?: string | null;
  projectIds?: string[];
  dueDate?: string | Date | null;
  spawnedFromTaskId?: string | null;
}

export class TaskServiceError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export async function createTask(input: CreateTaskInput) {
  const flow = await prisma.flow.findFirst({ where: { slug: input.flowSlug, orgId: input.orgId } });
  if (!flow) return null;

  const initialStatus = await getInitialStatus(flow.id);
  if (!initialStatus) throw new Error(`No statuses for flow: ${input.flowSlug}`);

  const projectIds = input.projectIds ?? [];
  if (projectIds.length > 0) {
    const found = await prisma.project.findMany({
      where: { id: { in: projectIds }, orgId: input.orgId },
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
  const hasExplicitAssignee = input.assigneeUserId !== undefined;
  if (!hasExplicitAssignee && projectIds.length > 0) {
    assigneeId = await resolveDefaultAssignee({
      projectId: projectIds[0],
      flowStatusId: initialStatus.id,
    });
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
        spawnedFromTaskId: input.spawnedFromTaskId ?? null,
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

export const taskDetailInclude = {
  ...taskInclude,
  spawnedFrom: {
    select: {
      id: true,
      displayId: true,
      title: true,
      flow: { select: { slug: true } },
    },
  },
  spawnedTasks: {
    select: {
      id: true,
      displayId: true,
      title: true,
      flow: { select: { slug: true } },
      currentStatus: { select: { slug: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  },
} as const;

export async function addProjectToTask(orgId: string, taskId: string, projectId: string) {
  const [task, project] = await Promise.all([
    prisma.task.findFirst({ where: { id: taskId, flow: { orgId } } }),
    prisma.project.findFirst({ where: { id: projectId, orgId } }),
  ]);
  if (!task) throw new TaskServiceError("NOT_FOUND", "Task not found", 404);
  if (!project) throw new TaskServiceError("INVALID_PROJECT", "Project not found", 422);

  await prisma.taskProject.upsert({
    where: { taskId_projectId: { taskId, projectId } },
    update: {},
    create: { taskId, projectId },
  });
}

export async function removeProjectFromTask(orgId: string, taskId: string, projectId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, flow: { orgId } },
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
