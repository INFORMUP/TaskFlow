import { FastifyInstance } from "fastify";
import { Type, type Static } from "@sinclair/typebox";
import {
  addProjectTeam,
  archiveProject,
  attachProjectFlow,
  canManageProject,
  clearStatusDefault,
  createProject,
  detachProjectFlow,
  getProject,
  isAdmin,
  listProjectFlows,
  listProjects,
  listStatusDefaults,
  ProjectServiceError,
  removeProjectTeam,
  setStatusDefault,
  updateProject,
} from "../services/project.service.js";
import { CommonErrorResponses, IdParams } from "./_schemas.js";

const UserRef = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    displayName: Type.String(),
    actorType: Type.String(),
  },
  { additionalProperties: true }
);

const FlowRef = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    slug: Type.String(),
    name: Type.String(),
  },
  { additionalProperties: true }
);

const TeamRef = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    slug: Type.String(),
    name: Type.String(),
  },
  { additionalProperties: true }
);

const ProjectRecord = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    key: Type.String(),
    name: Type.String(),
    owner: UserRef,
    defaultAssignee: Type.Union([UserRef, Type.Null()]),
    defaultFlow: Type.Union([FlowRef, Type.Null()]),
    teams: Type.Array(TeamRef),
    createdAt: Type.String({ format: "date-time" }),
    archivedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  },
  { additionalProperties: true }
);

const ProjectFlowEntry = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    slug: Type.String(),
    name: Type.String(),
    description: Type.Union([Type.String(), Type.Null()]),
    isDefault: Type.Boolean(),
  },
  { additionalProperties: true }
);

const CreateProjectBody = Type.Object({
  key: Type.String({ minLength: 1 }),
  name: Type.String({ minLength: 1 }),
  ownerUserId: Type.String({ format: "uuid" }),
  defaultAssigneeUserId: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  defaultFlowId: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  teamIds: Type.Optional(Type.Array(Type.String({ format: "uuid" }))),
});

const UpdateProjectBody = Type.Object({
  name: Type.Optional(Type.String({ minLength: 1 })),
  ownerUserId: Type.Optional(Type.String({ format: "uuid" })),
  defaultAssigneeUserId: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  defaultFlowId: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
});

const TeamIdBody = Type.Object({ teamId: Type.String({ format: "uuid" }) });
const FlowIdBody = Type.Object({ flowId: Type.String({ format: "uuid" }) });

const StatusDefaultRecord = Type.Object(
  {
    flowStatusId: Type.String({ format: "uuid" }),
    userId: Type.String({ format: "uuid" }),
  },
  { additionalProperties: true }
);

const StatusDefaultBody = Type.Object({ userId: Type.String({ format: "uuid" }) });

const StatusDefaultParams = Type.Object({
  id: Type.String({ format: "uuid" }),
  flowStatusId: Type.String({ format: "uuid" }),
});

const ListProjectsQuery = Type.Object({
  archived: Type.Optional(Type.String({ description: "Set to 'true' to include archived projects." })),
});

function handleError(reply: any, err: unknown) {
  if (err instanceof ProjectServiceError) {
    return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
  }
  throw err;
}

export async function projectRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: Static<typeof ListProjectsQuery> }>(
    "/api/v1/projects",
    {
      schema: {
        summary: "List projects",
        tags: ["projects"],
        querystring: ListProjectsQuery,
        response: {
          200: Type.Object(
            { data: Type.Array(ProjectRecord) },
            { additionalProperties: true }
          ),
          ...CommonErrorResponses,
        },
      },
    },
    async (request) => {
      const includeArchived = request.query.archived === "true";
      return { data: await listProjects(request.org.id, { includeArchived }) };
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/api/v1/projects/:id",
    {
      schema: {
        summary: "Get a project",
        tags: ["projects"],
        params: IdParams,
        response: { 200: ProjectRecord, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const project = await getProject(request.org.id, id);
      if (!project) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Project not found" } });
      }
      return project;
    }
  );

  fastify.post<{ Body: Static<typeof CreateProjectBody> }>(
    "/api/v1/projects",
    {
      schema: {
        summary: "Create a project",
        description: "Admin-only (engineer/product/admin teams). A project must have at least one team.",
        tags: ["projects"],
        body: CreateProjectBody,
        response: { 201: ProjectRecord, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      const teamSlugs = request.user.teams.map((t) => t.slug);
      const orgRole = request.org.role;
      if (orgRole !== "owner" && orgRole !== "admin" && !isAdmin(teamSlugs)) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "Only engineer or product team members can create projects" },
        });
      }
      const body = request.body;
      try {
        const project = await createProject({
          orgId: request.org.id,
          key: body.key,
          name: body.name,
          ownerUserId: body.ownerUserId,
          defaultAssigneeUserId: body.defaultAssigneeUserId ?? null,
          defaultFlowId: body.defaultFlowId ?? null,
          teamIds: body.teamIds ?? [],
        });
        return reply.status(201).send(project);
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );

  fastify.patch<{ Params: { id: string }; Body: Static<typeof UpdateProjectBody> }>(
    "/api/v1/projects/:id",
    {
      schema: {
        summary: "Update a project",
        description: "Project owner or admins only.",
        tags: ["projects"],
        params: IdParams,
        body: UpdateProjectBody,
        response: { 200: ProjectRecord, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const teamSlugs = request.user.teams.map((t) => t.slug);
      if (!(await canManageProject(request.org.id, id, request.user.id, teamSlugs, request.org.role))) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "Only the project owner or admins can edit this project" },
        });
      }
      try {
        return await updateProject(request.org.id, id, request.body as any);
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );

  fastify.post<{ Params: { id: string } }>(
    "/api/v1/projects/:id/archive",
    {
      schema: {
        summary: "Archive a project",
        tags: ["projects"],
        params: IdParams,
        response: { 200: ProjectRecord, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const teamSlugs = request.user.teams.map((t) => t.slug);
      if (!(await canManageProject(request.org.id, id, request.user.id, teamSlugs, request.org.role))) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "Only the project owner or admins can archive this project" },
        });
      }
      try {
        return await archiveProject(request.org.id, id, true);
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    "/api/v1/projects/:id/archive",
    {
      schema: {
        summary: "Unarchive a project",
        tags: ["projects"],
        params: IdParams,
        response: { 200: ProjectRecord, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const teamSlugs = request.user.teams.map((t) => t.slug);
      if (!(await canManageProject(request.org.id, id, request.user.id, teamSlugs, request.org.role))) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "Only the project owner or admins can unarchive this project" },
        });
      }
      try {
        return await archiveProject(request.org.id, id, false);
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );

  fastify.post<{ Params: { id: string }; Body: Static<typeof TeamIdBody> }>(
    "/api/v1/projects/:id/teams",
    {
      schema: {
        summary: "Attach a team to a project",
        tags: ["projects"],
        params: IdParams,
        body: TeamIdBody,
        response: { 200: ProjectRecord, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const teamSlugs = request.user.teams.map((t) => t.slug);
      if (!(await canManageProject(request.org.id, id, request.user.id, teamSlugs, request.org.role))) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "Only the project owner or admins can modify teams" },
        });
      }
      const { teamId } = request.body;
      try {
        return await addProjectTeam(request.org.id, id, teamId);
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );

  fastify.delete<{ Params: { id: string; teamId: string } }>(
    "/api/v1/projects/:id/teams/:teamId",
    {
      schema: {
        summary: "Detach a team from a project",
        tags: ["projects"],
        params: Type.Object({
          id: Type.String({ format: "uuid" }),
          teamId: Type.String({ format: "uuid" }),
        }),
        response: { 200: ProjectRecord, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      const { id, teamId } = request.params;
      const teamSlugs = request.user.teams.map((t) => t.slug);
      if (!(await canManageProject(request.org.id, id, request.user.id, teamSlugs, request.org.role))) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "Only the project owner or admins can modify teams" },
        });
      }
      try {
        return await removeProjectTeam(request.org.id, id, teamId);
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/api/v1/projects/:id/flows",
    {
      schema: {
        summary: "List flows attached to a project",
        tags: ["projects"],
        params: IdParams,
        response: {
          200: Type.Object(
            { data: Type.Array(ProjectFlowEntry) },
            { additionalProperties: true }
          ),
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      try {
        return { data: await listProjectFlows(request.org.id, id) };
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );

  fastify.post<{ Params: { id: string }; Body: Static<typeof FlowIdBody> }>(
    "/api/v1/projects/:id/flows",
    {
      schema: {
        summary: "Attach a flow to a project",
        tags: ["projects"],
        params: IdParams,
        body: FlowIdBody,
        response: {
          200: Type.Object(
            { data: Type.Array(ProjectFlowEntry) },
            { additionalProperties: true }
          ),
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const teamSlugs = request.user.teams.map((t) => t.slug);
      if (!(await canManageProject(request.org.id, id, request.user.id, teamSlugs, request.org.role))) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "Only the project owner or admins can modify flows" },
        });
      }
      const { flowId } = request.body;
      try {
        return { data: await attachProjectFlow(request.org.id, id, flowId) };
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/api/v1/projects/:id/status-defaults",
    {
      schema: {
        summary: "List per-status default assignees for a project",
        description: "Project owner or admins only.",
        tags: ["projects"],
        params: IdParams,
        response: {
          200: Type.Object(
            { data: Type.Array(StatusDefaultRecord) },
            { additionalProperties: true }
          ),
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const teamSlugs = request.user.teams.map((t) => t.slug);
      if (!(await canManageProject(request.org.id, id, request.user.id, teamSlugs, request.org.role))) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "Only the project owner or admins can view status defaults" },
        });
      }
      try {
        return { data: await listStatusDefaults(request.org.id, id) };
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );

  fastify.put<{ Params: Static<typeof StatusDefaultParams>; Body: Static<typeof StatusDefaultBody> }>(
    "/api/v1/projects/:id/status-defaults/:flowStatusId",
    {
      schema: {
        summary: "Set or update a project's default assignee for a flow status",
        description: "Project owner or admins only.",
        tags: ["projects"],
        params: StatusDefaultParams,
        body: StatusDefaultBody,
        response: { 200: StatusDefaultRecord, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      const { id, flowStatusId } = request.params;
      const teamSlugs = request.user.teams.map((t) => t.slug);
      if (!(await canManageProject(request.org.id, id, request.user.id, teamSlugs, request.org.role))) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "Only the project owner or admins can edit status defaults" },
        });
      }
      const { userId } = request.body;
      try {
        return await setStatusDefault(request.org.id, id, flowStatusId, userId);
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );

  fastify.delete<{ Params: Static<typeof StatusDefaultParams> }>(
    "/api/v1/projects/:id/status-defaults/:flowStatusId",
    {
      schema: {
        summary: "Clear a project's default assignee for a flow status",
        description: "Project owner or admins only.",
        tags: ["projects"],
        params: StatusDefaultParams,
        response: { 204: Type.Null(), ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      const { id, flowStatusId } = request.params;
      const teamSlugs = request.user.teams.map((t) => t.slug);
      if (!(await canManageProject(request.org.id, id, request.user.id, teamSlugs, request.org.role))) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "Only the project owner or admins can edit status defaults" },
        });
      }
      try {
        await clearStatusDefault(request.org.id, id, flowStatusId);
        return reply.status(204).send();
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );

  fastify.delete<{ Params: { id: string; flowId: string } }>(
    "/api/v1/projects/:id/flows/:flowId",
    {
      schema: {
        summary: "Detach a flow from a project",
        tags: ["projects"],
        params: Type.Object({
          id: Type.String({ format: "uuid" }),
          flowId: Type.String({ format: "uuid" }),
        }),
        response: {
          200: Type.Object(
            { data: Type.Array(ProjectFlowEntry) },
            { additionalProperties: true }
          ),
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      const { id, flowId } = request.params;
      const teamSlugs = request.user.teams.map((t) => t.slug);
      if (!(await canManageProject(request.org.id, id, request.user.id, teamSlugs, request.org.role))) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "Only the project owner or admins can modify flows" },
        });
      }
      try {
        return { data: await detachProjectFlow(request.org.id, id, flowId) };
      } catch (err) {
        return handleError(reply, err);
      }
    }
  );
}
