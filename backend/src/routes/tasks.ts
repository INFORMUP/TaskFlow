import { FastifyInstance } from "fastify";
import { Type, type Static } from "@sinclair/typebox";
import { prisma } from "../prisma-client.js";
import { buildTaskViewWhere, canPerformAction, enforceScope } from "../services/permission.service.js";
import { addProjectToTask, createTask, removeProjectFromTask, taskDetailInclude, taskInclude, TaskServiceError } from "../services/task.service.js";
import { attachLabel, detachLabel, LabelServiceError } from "../services/label.service.js";
import { getBlockerCounts } from "../services/task-dependency.service.js";
import { CommonErrorResponses, IdParams, UserSummary } from "./_schemas.js";

const FlowRef = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    slug: Type.String(),
    name: Type.String(),
  },
  { additionalProperties: true }
);

const StatusRef = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    slug: Type.String(),
    name: Type.String(),
  },
  { additionalProperties: true }
);

const LabelSummary = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    name: Type.String(),
    color: Type.String(),
  },
  { additionalProperties: true }
);

const ProjectMembership = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    key: Type.String(),
    name: Type.String(),
    owner: Type.Optional(UserSummary),
  },
  { additionalProperties: true }
);

const TaskRecord = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    displayId: Type.String(),
    title: Type.String(),
    description: Type.Union([Type.String(), Type.Null()]),
    priority: Type.String(),
    resolution: Type.Union([Type.String(), Type.Null()]),
    dueDate: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    isDeleted: Type.Boolean(),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
    flow: FlowRef,
    currentStatus: StatusRef,
    creator: UserSummary,
    assignee: Type.Union([UserSummary, Type.Null()]),
    projects: Type.Array(ProjectMembership),
    labels: Type.Array(LabelSummary),
  },
  { additionalProperties: true }
);

const CreateTaskBody = Type.Object({
  flow: Type.String({ minLength: 1 }),
  title: Type.String({ minLength: 1 }),
  description: Type.Optional(Type.String()),
  priority: Type.Optional(Type.String()),
  // Marked optional in the schema so the handler can return a specific
  // PROJECT_REQUIRED error code that callers depend on. Semantically required —
  // empty array or omission both produce PROJECT_REQUIRED.
  projectIds: Type.Optional(Type.Array(Type.String({ format: "uuid" }))),
  dueDate: Type.Optional(
    Type.Union([Type.String({ description: "ISO 8601 date or date-time." }), Type.Null()])
  ),
  assigneeUserId: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  spawnedFromTaskId: Type.Optional(
    Type.Union([Type.String({ format: "uuid", description: "UUID of the parent task this one was spawned from." }), Type.Null()])
  ),
});

const UpdateTaskBody = Type.Object({
  title: Type.Optional(Type.String({ minLength: 1 })),
  description: Type.Optional(Type.String()),
  priority: Type.Optional(Type.String()),
  dueDate: Type.Optional(
    Type.Union([Type.String({ description: "ISO 8601 date or date-time." }), Type.Null()])
  ),
  assigneeUserId: Type.Optional(
    Type.Union([Type.String({ format: "uuid" }), Type.Null()])
  ),
});

const ProjectIdBody = Type.Object({ projectId: Type.String({ format: "uuid" }) });

const ListTasksQuery = Type.Object({
  flow: Type.Optional(Type.String()),
  status: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
  assignee: Type.Optional(Type.String({ description: "User ID or the literal 'me'." })),
  assigneeUserId: Type.Optional(Type.String()),
  priority: Type.Optional(Type.String()),
  projectId: Type.Optional(Type.String({ format: "uuid" })),
  projectOwnerUserId: Type.Optional(Type.String({ format: "uuid" })),
  dueBefore: Type.Optional(Type.String({ description: "ISO 8601 date or date-time." })),
  dueAfter: Type.Optional(Type.String({ description: "ISO 8601 date or date-time." })),
  q: Type.Optional(Type.String({ description: "Case-insensitive substring match against title or description." })),
  label: Type.Optional(
    Type.Union([Type.String(), Type.Array(Type.String())], {
      description: "Repeated label=<uuid> or comma-separated label=a,b,c. Tasks must have ALL supplied labels.",
    })
  ),
  cursor: Type.Optional(Type.String({ description: "Opaque cursor — an ISO timestamp from a previous response." })),
  limit: Type.Optional(Type.String({ description: "Integer 1–100 as a string." })),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseLabelParam(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const ids: string[] = [];
  for (const entry of arr) {
    for (const part of entry.split(",")) {
      const trimmed = part.trim();
      if (trimmed && UUID_RE.test(trimmed)) ids.push(trimmed);
    }
  }
  return Array.from(new Set(ids));
}

async function getFlowIdBySlug(orgId: string): Promise<Map<string, string>> {
  const flows = await prisma.flow.findMany({ where: { orgId } });
  return new Map(flows.map((f) => [f.slug, f.id]));
}

export async function taskRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: Static<typeof CreateTaskBody> }>(
    "/api/v1/tasks",
    {
      schema: {
        summary: "Create a task",
        description:
          "Requires tasks:write scope and `create` permission for the target flow. `projectIds` must be non-empty — returns 400 PROJECT_REQUIRED if missing.",
        tags: ["tasks"],
        body: CreateTaskBody,
        response: { 201: TaskRecord, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:write")) return;
      const { flow, title, description, priority, projectIds, dueDate, assigneeUserId, spawnedFromTaskId } = request.body;

      if (!projectIds || projectIds.length === 0) {
        return reply.status(400).send({
          error: { code: "PROJECT_REQUIRED", message: "At least one project is required" },
        });
      }

      const flowRecord = await prisma.flow.findFirst({ where: { slug: flow, orgId: request.org.id } });
      if (!flowRecord) {
        return reply.status(422).send({
          error: { code: "INVALID_FLOW", message: `Unknown flow: ${flow}` },
        });
      }

      const teamSlugs = request.user.teams.map((t) => t.slug);
      if (!canPerformAction(teamSlugs, "create", flow)) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "You do not have permission to create tasks in this flow" },
        });
      }

      if (spawnedFromTaskId) {
        const flowIdBySlug = await getFlowIdBySlug(request.org.id);
        const viewWhere = buildTaskViewWhere(teamSlugs, request.user.id, flowIdBySlug);
        const parent = await prisma.task.findFirst({
          where: { id: spawnedFromTaskId, isDeleted: false, ...viewWhere },
          select: { id: true },
        });
        if (!parent) {
          return reply.status(404).send({
            error: { code: "SPAWNED_FROM_NOT_FOUND", message: "Parent task not found or not visible" },
          });
        }
      }

      try {
        const task = await createTask({
          orgId: request.org.id,
          flowSlug: flow,
          title,
          description,
          priority: priority || "medium",
          createdBy: request.user.id,
          actorType: request.user.actorType,
          assigneeUserId,
          projectIds: projectIds ?? [],
          dueDate: dueDate ?? null,
          spawnedFromTaskId: spawnedFromTaskId ?? null,
        });
        return reply.status(201).send(formatTask(task!));
      } catch (err) {
        if (err instanceof TaskServiceError) {
          return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    }
  );

  fastify.post<{ Params: { id: string }; Body: Static<typeof ProjectIdBody> }>(
    "/api/v1/tasks/:id/projects",
    {
      schema: {
        summary: "Add a project to a task",
        tags: ["tasks"],
        params: IdParams,
        body: ProjectIdBody,
        response: { 204: Type.Null(), ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:write")) return;
      const { id } = request.params;
      const { projectId } = request.body;

      const flowIdBySlug = await getFlowIdBySlug(request.org.id);
      const teamSlugs = request.user.teams.map((t) => t.slug);
      const viewWhere = buildTaskViewWhere(teamSlugs, request.user.id, flowIdBySlug);
      const task = await prisma.task.findFirst({
        where: { id, isDeleted: false, ...viewWhere },
        include: { flow: true },
      });
      if (!task) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Task not found" } });
      if (!canPerformAction(teamSlugs, "edit", task.flow.slug)) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Insufficient permission" } });
      }

      try {
        await addProjectToTask(request.org.id, id, projectId);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof TaskServiceError) {
          return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    }
  );

  fastify.delete<{ Params: { id: string; projectId: string } }>(
    "/api/v1/tasks/:id/projects/:projectId",
    {
      schema: {
        summary: "Remove a project from a task",
        description: "Returns 400 LAST_PROJECT if removing the only project on the task.",
        tags: ["tasks"],
        params: Type.Object({
          id: Type.String({ format: "uuid" }),
          projectId: Type.String({ format: "uuid" }),
        }),
        response: { 204: Type.Null(), ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:write")) return;
      const { id, projectId } = request.params;

      const flowIdBySlug = await getFlowIdBySlug(request.org.id);
      const teamSlugs = request.user.teams.map((t) => t.slug);
      const viewWhere = buildTaskViewWhere(teamSlugs, request.user.id, flowIdBySlug);
      const task = await prisma.task.findFirst({
        where: { id, isDeleted: false, ...viewWhere },
        include: { flow: true },
      });
      if (!task) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Task not found" } });
      if (!canPerformAction(teamSlugs, "edit", task.flow.slug)) {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Insufficient permission" } });
      }

      try {
        await removeProjectFromTask(request.org.id, id, projectId);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof TaskServiceError) {
          return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    }
  );

  fastify.get<{ Querystring: Static<typeof ListTasksQuery> }>(
    "/api/v1/tasks",
    {
      schema: {
        summary: "List tasks",
        description:
          "Requires tasks:read scope. Filters visible tasks by flow, status, assignee, priority, project, due-date window. Cursor-paginated (`cursor` is a `createdAt` ISO timestamp; `limit` max 100).",
        tags: ["tasks"],
        querystring: ListTasksQuery,
        response: {
          200: Type.Object(
            {
              data: Type.Array(TaskRecord),
              pagination: Type.Object(
                {
                  cursor: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
                  hasMore: Type.Boolean(),
                },
                { additionalProperties: true }
              ),
            },
            { additionalProperties: true }
          ),
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:read")) return;
      const query = request.query;

      const flowIdBySlug = await getFlowIdBySlug(request.org.id);
      const teamSlugs = request.user.teams.map((t) => t.slug);
      const viewWhere = buildTaskViewWhere(teamSlugs, request.user.id, flowIdBySlug);

      const where: Record<string, unknown> = { isDeleted: false, ...viewWhere };

      if (query.flow) {
        const flow = await prisma.flow.findFirst({ where: { slug: query.flow, orgId: request.org.id } });
        if (flow) where.flowId = flow.id;
      }

      if (query.status) {
        const slugs = Array.isArray(query.status) ? query.status : [query.status];
        const statuses = await prisma.flowStatus.findMany({
          where: { slug: { in: slugs }, flow: { orgId: request.org.id } },
        });
        if (statuses.length > 0) {
          where.currentStatusId = { in: statuses.map((s) => s.id) };
        }
      }

      const assigneeParam = query.assigneeUserId ?? query.assignee;
      if (assigneeParam) {
        where.assigneeId = assigneeParam === "me" ? request.user.id : assigneeParam;
      }

      if (query.priority) {
        where.priority = query.priority;
      }

      if (query.projectId) {
        where.projects = { some: { projectId: query.projectId } };
      }

      if (query.projectOwnerUserId) {
        const existingProjects = (where.projects as any) ?? {};
        where.projects = {
          some: {
            ...(existingProjects.some ?? {}),
            project: { ownerUserId: query.projectOwnerUserId },
          },
        };
      }

      if (query.q) {
        const q = query.q;
        where.OR = [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ];
      }

      const labelIds = parseLabelParam(query.label);
      if (labelIds.length > 0) {
        // Intersection: task must have every supplied label.
        where.AND = [
          ...((where.AND as Record<string, unknown>[]) ?? []),
          ...labelIds.map((labelId) => ({ labels: { some: { labelId } } })),
        ];
      }

      if (query.dueBefore || query.dueAfter) {
        const due: Record<string, Date> = {};
        if (query.dueAfter) due.gte = new Date(query.dueAfter);
        if (query.dueBefore) due.lte = new Date(query.dueBefore);
        where.dueDate = due;
      }

      const limit = Math.min(parseInt(query.limit || "25", 10), 100);

      if (query.cursor) {
        where.createdAt = { lt: new Date(query.cursor) };
      }

      const tasks = await prisma.task.findMany({
        where,
        include: taskInclude,
        orderBy: { createdAt: "desc" },
        take: limit + 1,
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
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/api/v1/tasks/:id",
    {
      schema: {
        summary: "Get a task",
        tags: ["tasks"],
        params: IdParams,
        response: { 200: TaskRecord, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:read")) return;
      const { id } = request.params;

      const flowIdBySlug = await getFlowIdBySlug(request.org.id);
      const teamSlugs = request.user.teams.map((t) => t.slug);
      const viewWhere = buildTaskViewWhere(teamSlugs, request.user.id, flowIdBySlug);

      const task = await prisma.task.findFirst({
        where: { id, isDeleted: false, ...viewWhere },
        include: taskDetailInclude,
      });

      if (!task) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Task not found" },
        });
      }

      const counts = await getBlockerCounts(task.id);
      return { ...formatTask(task), ...counts };
    }
  );

  fastify.patch<{ Params: { id: string }; Body: Static<typeof UpdateTaskBody> }>(
    "/api/v1/tasks/:id",
    {
      schema: {
        summary: "Update a task",
        description: "Requires tasks:write scope and `edit` permission for the task's flow.",
        tags: ["tasks"],
        params: IdParams,
        body: UpdateTaskBody,
        response: { 200: TaskRecord, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:write")) return;
      const { id } = request.params;
      const updates = request.body;

      const flowIdBySlug = await getFlowIdBySlug(request.org.id);
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

      if (updates.assigneeUserId) {
        const assignee = await prisma.user.findUnique({
          where: { id: updates.assigneeUserId },
        });
        if (!assignee) {
          return reply.status(400).send({
            error: { code: "INVALID_ASSIGNEE", message: "Assignee user not found" },
          });
        }
      }

      const updated = await prisma.task.update({
        where: { id },
        data: {
          ...(updates.title && { title: updates.title }),
          ...(updates.description !== undefined && { description: updates.description }),
          ...(updates.priority && { priority: updates.priority }),
          ...(updates.dueDate !== undefined && { dueDate: updates.dueDate ? new Date(updates.dueDate) : null }),
          ...(updates.assigneeUserId !== undefined && { assigneeId: updates.assigneeUserId }),
        },
        include: taskInclude,
      });

      return formatTask(updated);
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    "/api/v1/tasks/:id",
    {
      schema: {
        summary: "Delete a task (soft)",
        description: "Requires tasks:write scope and `delete` permission for the task's flow.",
        tags: ["tasks"],
        params: IdParams,
        response: {
          200: Type.Object({ success: Type.Literal(true) }, { additionalProperties: true }),
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:write")) return;
      const { id } = request.params;

      const flowIdBySlug = await getFlowIdBySlug(request.org.id);
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

      return { success: true as const };
    }
  );

  fastify.post<{ Params: { id: string }; Body: { labelId: string } }>(
    "/api/v1/tasks/:id/labels",
    {
      schema: {
        summary: "Attach a label to a task",
        description: "Requires tasks:write scope and `edit` permission for the task's flow.",
        tags: ["tasks"],
        params: IdParams,
        body: Type.Object({ labelId: Type.String({ format: "uuid" }) }),
        response: {
          204: Type.Null(),
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:write")) return;
      const { id } = request.params;
      const { labelId } = request.body;

      const flowIdBySlug = await getFlowIdBySlug(request.org.id);
      const teamSlugs = request.user.teams.map((t) => t.slug);
      const viewWhere = buildTaskViewWhere(teamSlugs, request.user.id, flowIdBySlug);
      const task = await prisma.task.findFirst({
        where: { id, isDeleted: false, ...viewWhere },
        include: { flow: true },
      });
      if (!task) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Task not found" } });
      }
      if (!canPerformAction(teamSlugs, "edit", task.flow.slug)) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "You do not have permission to edit this task" },
        });
      }

      try {
        await attachLabel(request.org.id, id, labelId);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof LabelServiceError) {
          return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    }
  );

  fastify.delete<{ Params: { id: string; labelId: string } }>(
    "/api/v1/tasks/:id/labels/:labelId",
    {
      schema: {
        summary: "Detach a label from a task",
        description: "Requires tasks:write scope and `edit` permission for the task's flow.",
        tags: ["tasks"],
        params: Type.Object({
          id: Type.String({ format: "uuid" }),
          labelId: Type.String({ format: "uuid" }),
        }),
        response: { 204: Type.Null(), ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:write")) return;
      const { id, labelId } = request.params;

      const flowIdBySlug = await getFlowIdBySlug(request.org.id);
      const teamSlugs = request.user.teams.map((t) => t.slug);
      const viewWhere = buildTaskViewWhere(teamSlugs, request.user.id, flowIdBySlug);
      const task = await prisma.task.findFirst({
        where: { id, isDeleted: false, ...viewWhere },
        include: { flow: true },
      });
      if (!task) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Task not found" } });
      }
      if (!canPerformAction(teamSlugs, "edit", task.flow.slug)) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "You do not have permission to edit this task" },
        });
      }

      try {
        await detachLabel(request.org.id, id, labelId);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof LabelServiceError) {
          return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
        }
        throw err;
      }
    }
  );
}

function formatTask(task: any) {
  const base: Record<string, unknown> = {
    id: task.id,
    displayId: task.displayId,
    title: task.title,
    description: task.description,
    priority: task.priority,
    resolution: task.resolution,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    isDeleted: task.isDeleted,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    flow: { id: task.flow.id, slug: task.flow.slug, name: task.flow.name },
    currentStatus: { id: task.currentStatus.id, slug: task.currentStatus.slug, name: task.currentStatus.name },
    creator: task.creator,
    assignee: task.assignee,
    projects: (task.projects ?? []).map((tp: any) => ({
      id: tp.project.id,
      key: tp.project.key,
      name: tp.project.name,
      owner: tp.project.owner,
    })),
    labels: (task.labels ?? []).map((tl: any) => ({
      id: tl.label.id,
      name: tl.label.name,
      color: tl.label.color,
    })),
  };

  // Detail-only fields, present only when taskDetailInclude was used.
  if ("spawnedFrom" in task) {
    base.spawnedFromTask = task.spawnedFrom
      ? {
          id: task.spawnedFrom.id,
          displayId: task.spawnedFrom.displayId,
          title: task.spawnedFrom.title,
          flow: { slug: task.spawnedFrom.flow.slug },
        }
      : null;
  }
  if ("spawnedTasks" in task) {
    base.spawnedTasks = (task.spawnedTasks ?? []).map((c: any) => ({
      id: c.id,
      displayId: c.displayId,
      title: c.title,
      flow: { slug: c.flow.slug },
      currentStatus: { slug: c.currentStatus.slug, name: c.currentStatus.name },
    }));
  }
  return base;
}
