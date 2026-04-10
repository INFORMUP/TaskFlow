import { FastifyInstance } from "fastify";
import { prisma } from "../prisma-client.js";
import { buildTaskViewWhere, canPerformAction } from "../services/permission.service.js";
import { createTask } from "../services/task.service.js";

async function getFlowIdBySlug(): Promise<Map<string, string>> {
  const flows = await prisma.flow.findMany();
  return new Map(flows.map((f) => [f.slug, f.id]));
}

export async function taskRoutes(fastify: FastifyInstance) {
  // Create task
  fastify.post("/api/v1/tasks", async (request, reply) => {
    const { flow, title, description, priority } = request.body as {
      flow?: string;
      title?: string;
      description?: string;
      priority?: string;
    };

    if (!title) {
      return reply.status(400).send({
        error: { code: "BAD_REQUEST", message: "Title is required" },
      });
    }

    if (!flow) {
      return reply.status(400).send({
        error: { code: "BAD_REQUEST", message: "Flow is required" },
      });
    }

    // Validate flow exists
    const flowRecord = await prisma.flow.findUnique({ where: { slug: flow } });
    if (!flowRecord) {
      return reply.status(422).send({
        error: { code: "INVALID_FLOW", message: `Unknown flow: ${flow}` },
      });
    }

    // Check create permission
    const teamSlugs = request.user.teams.map((t) => t.slug);
    if (!canPerformAction(teamSlugs, "create", flow)) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "You do not have permission to create tasks in this flow" },
      });
    }

    const task = await createTask({
      flowSlug: flow,
      title,
      description,
      priority: priority || "medium",
      createdBy: request.user.id,
      actorType: request.user.actorType,
    });

    return reply.status(201).send(formatTask(task!));
  });

  // List tasks
  fastify.get("/api/v1/tasks", async (request, reply) => {
    const query = request.query as {
      flow?: string;
      status?: string;
      assignee?: string;
      priority?: string;
      cursor?: string;
      limit?: string;
    };

    const flowIdBySlug = await getFlowIdBySlug();
    const teamSlugs = request.user.teams.map((t) => t.slug);
    const viewWhere = buildTaskViewWhere(teamSlugs, request.user.id, flowIdBySlug);

    const where: Record<string, unknown> = { isDeleted: false, ...viewWhere };

    if (query.flow) {
      const flow = await prisma.flow.findUnique({ where: { slug: query.flow } });
      if (flow) where.flowId = flow.id;
    }

    if (query.status) {
      const statuses = await prisma.flowStatus.findMany({
        where: { slug: query.status },
      });
      if (statuses.length > 0) {
        where.currentStatusId = { in: statuses.map((s) => s.id) };
      }
    }

    if (query.assignee) {
      where.assigneeId = query.assignee;
    }

    if (query.priority) {
      where.priority = query.priority;
    }

    const limit = Math.min(parseInt(query.limit || "25", 10), 100);

    if (query.cursor) {
      where.createdAt = { lt: new Date(query.cursor) };
    }

    const tasks = await prisma.task.findMany({
      where,
      include: {
        flow: true,
        currentStatus: true,
        creator: { select: { id: true, displayName: true, actorType: true } },
        assignee: { select: { id: true, displayName: true, actorType: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1, // Fetch one extra to detect next page
    });

    const hasMore = tasks.length > limit;
    const data = tasks.slice(0, limit);
    const nextCursor = hasMore && data.length > 0
      ? data[data.length - 1].createdAt.toISOString()
      : null;

    return {
      data: data.map(formatTask),
      pagination: { cursor: nextCursor, hasMore },
    };
  });

  // Get task detail
  fastify.get("/api/v1/tasks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const flowIdBySlug = await getFlowIdBySlug();
    const teamSlugs = request.user.teams.map((t) => t.slug);
    const viewWhere = buildTaskViewWhere(teamSlugs, request.user.id, flowIdBySlug);

    const task = await prisma.task.findFirst({
      where: { id, isDeleted: false, ...viewWhere },
      include: {
        flow: true,
        currentStatus: true,
        creator: { select: { id: true, displayName: true, actorType: true } },
        assignee: { select: { id: true, displayName: true, actorType: true } },
      },
    });

    if (!task) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Task not found" },
      });
    }

    return formatTask(task);
  });

  // Update task
  fastify.patch("/api/v1/tasks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as { title?: string; description?: string; priority?: string };

    const flowIdBySlug = await getFlowIdBySlug();
    const teamSlugs = request.user.teams.map((t) => t.slug);
    const viewWhere = buildTaskViewWhere(teamSlugs, request.user.id, flowIdBySlug);

    const task = await prisma.task.findFirst({
      where: { id, isDeleted: false, ...viewWhere },
      include: { flow: true },
    });

    if (!task) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Task not found" },
      });
    }

    if (!canPerformAction(teamSlugs, "edit", task.flow.slug)) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "You do not have permission to edit this task" },
      });
    }

    const updated = await prisma.task.update({
      where: { id },
      data: {
        ...(updates.title && { title: updates.title }),
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.priority && { priority: updates.priority }),
      },
      include: {
        flow: true,
        currentStatus: true,
        creator: { select: { id: true, displayName: true, actorType: true } },
        assignee: { select: { id: true, displayName: true, actorType: true } },
      },
    });

    return formatTask(updated);
  });

  // Delete task (soft)
  fastify.delete("/api/v1/tasks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const flowIdBySlug = await getFlowIdBySlug();
    const teamSlugs = request.user.teams.map((t) => t.slug);
    const viewWhere = buildTaskViewWhere(teamSlugs, request.user.id, flowIdBySlug);

    const task = await prisma.task.findFirst({
      where: { id, isDeleted: false, ...viewWhere },
      include: { flow: true },
    });

    if (!task) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Task not found" },
      });
    }

    if (!canPerformAction(teamSlugs, "delete", task.flow.slug)) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "You do not have permission to delete this task" },
      });
    }

    await prisma.task.update({
      where: { id },
      data: { isDeleted: true },
    });

    return { success: true };
  });
}

function formatTask(task: any) {
  return {
    id: task.id,
    displayId: task.displayId,
    title: task.title,
    description: task.description,
    priority: task.priority,
    resolution: task.resolution,
    isDeleted: task.isDeleted,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    flow: { id: task.flow.id, slug: task.flow.slug, name: task.flow.name },
    currentStatus: { id: task.currentStatus.id, slug: task.currentStatus.slug, name: task.currentStatus.name },
    creator: task.creator,
    assignee: task.assignee,
  };
}
