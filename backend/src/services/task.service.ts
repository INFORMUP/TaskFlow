import { prisma } from "../prisma-client.js";

const FLOW_PREFIXES: Record<string, string> = {
  bug: "BUG",
  feature: "FEAT",
  improvement: "IMP",
};

export async function generateDisplayId(flowSlug: string): Promise<string> {
  const prefix = FLOW_PREFIXES[flowSlug];
  if (!prefix) throw new Error(`Unknown flow: ${flowSlug}`);

  const flow = await prisma.flow.findUnique({ where: { slug: flowSlug } });
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
}

export async function createTask(input: CreateTaskInput) {
  const flow = await prisma.flow.findUnique({ where: { slug: input.flowSlug } });
  if (!flow) return null;

  const initialStatus = await getInitialStatus(flow.id);
  if (!initialStatus) throw new Error(`No statuses for flow: ${input.flowSlug}`);

  const displayId = await generateDisplayId(input.flowSlug);

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
      },
      include: {
        flow: true,
        currentStatus: true,
        creator: { select: { id: true, displayName: true, actorType: true } },
        assignee: { select: { id: true, displayName: true, actorType: true } },
      },
    });

    // Create initial transition record
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

    return task;
  });
}
