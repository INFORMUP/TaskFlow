import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { Type, type Static } from "@sinclair/typebox";
import { prisma } from "../prisma-client.js";
import { buildTaskViewWhere, canPerformAction, enforceScope } from "../services/permission.service.js";
import {
  CodeLinkServiceError,
  createTaskCommit,
  createTaskPullRequest,
  deleteTaskCommit,
  deleteTaskPullRequest,
  listTaskCommits,
  listTaskPullRequests,
} from "../services/task-code-links.service.js";
import { CommonErrorResponses, IdParams } from "./_schemas.js";

const RepoRef = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    provider: Type.String(),
    owner: Type.String(),
    name: Type.String(),
  },
  { additionalProperties: true }
);

const CommitRecord = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    taskId: Type.String({ format: "uuid" }),
    repositoryId: Type.String({ format: "uuid" }),
    repository: Type.Optional(RepoRef),
    sha: Type.String(),
    message: Type.Union([Type.String(), Type.Null()]),
    author: Type.Union([Type.String(), Type.Null()]),
    authoredAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    url: Type.String(),
    createdAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: true }
);

const CreateCommitBody = Type.Object({
  repositoryId: Type.Optional(Type.String({ format: "uuid" })),
  sha: Type.Optional(Type.String()),
  message: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  author: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  authoredAt: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  url: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

const PullRequestRecord = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    taskId: Type.String({ format: "uuid" }),
    repositoryId: Type.String({ format: "uuid" }),
    repository: Type.Optional(RepoRef),
    number: Type.Integer(),
    title: Type.Union([Type.String(), Type.Null()]),
    state: Type.String(),
    author: Type.Union([Type.String(), Type.Null()]),
    mergedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    url: Type.String(),
    createdAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: true }
);

const CreatePullRequestBody = Type.Object({
  repositoryId: Type.Optional(Type.String({ format: "uuid" })),
  number: Type.Optional(Type.Integer({ minimum: 1 })),
  title: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  state: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  author: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  mergedAt: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  url: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

const CommitParams = Type.Object({
  id: Type.String({ format: "uuid" }),
  commitId: Type.String({ format: "uuid" }),
});

const PrParams = Type.Object({
  id: Type.String({ format: "uuid" }),
  prId: Type.String({ format: "uuid" }),
});

function handleError(reply: FastifyReply, err: unknown) {
  if (err instanceof CodeLinkServiceError) {
    return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
  }
  throw err;
}

async function loadTaskOrForbid(
  request: FastifyRequest,
  reply: FastifyReply,
  taskId: string,
  action: "view" | "edit",
) {
  const flows = await prisma.flow.findMany({ where: { orgId: request.org.id } });
  const flowIdBySlug = new Map(flows.map((f) => [f.slug, f.id]));
  const teamSlugs = request.user.teams.map((t) => t.slug);
  const viewWhere = buildTaskViewWhere(teamSlugs, request.user.id, flowIdBySlug);
  const task = await prisma.task.findFirst({
    where: { id: taskId, isDeleted: false, ...viewWhere },
    include: { flow: true },
  });
  if (!task) {
    reply.status(404).send({ error: { code: "NOT_FOUND", message: "Task not found" } });
    return null;
  }
  if (action === "edit" && !canPerformAction(teamSlugs, "edit", task.flow.slug)) {
    reply.status(403).send({ error: { code: "FORBIDDEN", message: "Insufficient permission" } });
    return null;
  }
  return task;
}

export async function taskCodeLinkRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { id: string } }>(
    "/api/v1/tasks/:id/commits",
    {
      schema: {
        summary: "List commits linked to a task",
        tags: ["tasks"],
        params: IdParams,
        response: {
          200: Type.Object({ data: Type.Array(CommitRecord) }, { additionalProperties: true }),
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:read")) return;
      const task = await loadTaskOrForbid(request, reply, request.params.id, "view");
      if (!task) return;
      try {
        return { data: await listTaskCommits(request.org.id, request.params.id) };
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );

  fastify.post<{ Params: { id: string }; Body: Static<typeof CreateCommitBody> }>(
    "/api/v1/tasks/:id/commits",
    {
      schema: {
        summary: "Link a commit to a task",
        tags: ["tasks"],
        params: IdParams,
        body: CreateCommitBody,
        response: { 201: CommitRecord, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:write")) return;
      const task = await loadTaskOrForbid(request, reply, request.params.id, "edit");
      if (!task) return;
      try {
        const created = await createTaskCommit(request.org.id, request.params.id, request.body);
        return reply.status(201).send(created);
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );

  fastify.delete<{ Params: Static<typeof CommitParams> }>(
    "/api/v1/tasks/:id/commits/:commitId",
    {
      schema: {
        summary: "Unlink a commit from a task",
        tags: ["tasks"],
        params: CommitParams,
        response: { 204: Type.Null(), ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:write")) return;
      const task = await loadTaskOrForbid(request, reply, request.params.id, "edit");
      if (!task) return;
      try {
        await deleteTaskCommit(request.org.id, request.params.id, request.params.commitId);
        return reply.status(204).send();
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/api/v1/tasks/:id/pull-requests",
    {
      schema: {
        summary: "List pull requests linked to a task",
        tags: ["tasks"],
        params: IdParams,
        response: {
          200: Type.Object({ data: Type.Array(PullRequestRecord) }, { additionalProperties: true }),
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:read")) return;
      const task = await loadTaskOrForbid(request, reply, request.params.id, "view");
      if (!task) return;
      try {
        return { data: await listTaskPullRequests(request.org.id, request.params.id) };
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );

  fastify.post<{ Params: { id: string }; Body: Static<typeof CreatePullRequestBody> }>(
    "/api/v1/tasks/:id/pull-requests",
    {
      schema: {
        summary: "Link a pull request to a task",
        tags: ["tasks"],
        params: IdParams,
        body: CreatePullRequestBody,
        response: { 201: PullRequestRecord, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:write")) return;
      const task = await loadTaskOrForbid(request, reply, request.params.id, "edit");
      if (!task) return;
      try {
        const created = await createTaskPullRequest(
          request.org.id,
          request.params.id,
          request.body,
        );
        return reply.status(201).send(created);
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );

  fastify.delete<{ Params: Static<typeof PrParams> }>(
    "/api/v1/tasks/:id/pull-requests/:prId",
    {
      schema: {
        summary: "Unlink a pull request from a task",
        tags: ["tasks"],
        params: PrParams,
        response: { 204: Type.Null(), ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:write")) return;
      const task = await loadTaskOrForbid(request, reply, request.params.id, "edit");
      if (!task) return;
      try {
        await deleteTaskPullRequest(request.org.id, request.params.id, request.params.prId);
        return reply.status(204).send();
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );
}
