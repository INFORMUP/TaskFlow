import { FastifyInstance } from "fastify";
import { Type } from "@sinclair/typebox";
import { prisma } from "../prisma-client.js";
import { buildTaskViewWhere, enforceScope } from "../services/permission.service.js";
import {
  addBlocker,
  listForTask,
  removeBlocker,
  TaskDependencyError,
} from "../services/task-dependency.service.js";
import { CommonErrorResponses } from "./_schemas.js";

const TaskRef = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    displayId: Type.String(),
    title: Type.String(),
    flow: Type.Object({ slug: Type.String(), name: Type.String() }, { additionalProperties: true }),
    currentStatus: Type.Object(
      { slug: Type.String(), name: Type.String() },
      { additionalProperties: true },
    ),
  },
  { additionalProperties: true },
);

const BlockersResponse = Type.Object(
  {
    blockers: Type.Array(TaskRef),
    blocking: Type.Array(TaskRef),
  },
  { additionalProperties: true },
);

const AddBlockerBody = Type.Object({
  blockingTaskId: Type.String({ format: "uuid" }),
});

const AddBlockerResponse = Type.Object(
  { blocker: TaskRef },
  { additionalProperties: true },
);

const PathParams = Type.Object({ id: Type.String({ format: "uuid" }) });
const RemoveParams = Type.Object({
  id: Type.String({ format: "uuid" }),
  blockingTaskId: Type.String({ format: "uuid" }),
});

async function getViewWhere(orgId: string, teamSlugs: string[], userId: string) {
  const flows = await prisma.flow.findMany({ where: { orgId } });
  const flowIdBySlug = new Map(flows.map((f) => [f.slug, f.id]));
  return buildTaskViewWhere(teamSlugs, userId, flowIdBySlug);
}

function handleError(err: unknown, reply: any) {
  if (err instanceof TaskDependencyError) {
    return reply
      .status(err.status)
      .send({ error: { code: err.code, message: err.message } });
  }
  throw err;
}

export async function taskBlockerRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/api/v1/tasks/:id/blockers",
    {
      schema: {
        summary: "List blockers and blocked-tasks for a task",
        description: "Requires tasks:read scope.",
        tags: ["tasks"],
        params: PathParams,
        response: { 200: BlockersResponse, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:read")) return;
      const { id } = request.params as { id: string };
      const teamSlugs = request.user.teams.map((t) => t.slug);
      const viewWhere = await getViewWhere(request.org.id, teamSlugs, request.user.id);

      try {
        return await listForTask({ taskId: id, taskVisibilityWhere: viewWhere });
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  fastify.post(
    "/api/v1/tasks/:id/blockers",
    {
      schema: {
        summary: "Add a blocker to a task",
        description:
          "Marks the task as blocked by `blockingTaskId`. Requires tasks:write scope. Returns 400 SELF_BLOCKER_NOT_ALLOWED, 404 BLOCKING_TASK_NOT_FOUND, 409 BLOCKER_ALREADY_EXISTS or CYCLIC_BLOCKER as appropriate.",
        tags: ["tasks"],
        params: PathParams,
        body: AddBlockerBody,
        response: { 201: AddBlockerResponse, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:write")) return;
      const { id } = request.params as { id: string };
      const { blockingTaskId } = request.body as { blockingTaskId: string };
      const teamSlugs = request.user.teams.map((t) => t.slug);
      const viewWhere = await getViewWhere(request.org.id, teamSlugs, request.user.id);

      try {
        const blocker = await addBlocker({
          taskId: id,
          blockingTaskId,
          createdBy: request.user.id,
          taskVisibilityWhere: viewWhere,
        });
        return reply.status(201).send({ blocker });
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );

  fastify.delete(
    "/api/v1/tasks/:id/blockers/:blockingTaskId",
    {
      schema: {
        summary: "Remove a blocker from a task",
        description: "Requires tasks:write scope. Returns 204 on success, 404 if the blocker does not exist.",
        tags: ["tasks"],
        params: RemoveParams,
        response: {
          204: Type.Null(),
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:write")) return;
      const { id, blockingTaskId } = request.params as {
        id: string;
        blockingTaskId: string;
      };
      const teamSlugs = request.user.teams.map((t) => t.slug);
      const viewWhere = await getViewWhere(request.org.id, teamSlugs, request.user.id);

      try {
        await removeBlocker({
          taskId: id,
          blockingTaskId,
          taskVisibilityWhere: viewWhere,
        });
        return reply.status(204).send();
      } catch (err) {
        return handleError(err, reply);
      }
    },
  );
}
