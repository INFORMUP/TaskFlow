import { FastifyInstance } from "fastify";
import {
  addProjectTeam,
  archiveProject,
  canManageProject,
  createProject,
  getProject,
  isAdmin,
  listProjects,
  ProjectServiceError,
  removeProjectTeam,
  updateProject,
} from "../services/project.service.js";

function handleError(reply: any, err: unknown) {
  if (err instanceof ProjectServiceError) {
    return reply.status(err.status).send({ error: { code: err.code, message: err.message } });
  }
  throw err;
}

export async function projectRoutes(fastify: FastifyInstance) {
  fastify.get("/api/v1/projects", async (request) => {
    const query = request.query as { archived?: string };
    const includeArchived = query.archived === "true";
    return { data: await listProjects({ includeArchived }) };
  });

  fastify.get("/api/v1/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const project = await getProject(id);
    if (!project) {
      return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Project not found" } });
    }
    return project;
  });

  fastify.post("/api/v1/projects", async (request, reply) => {
    const teamSlugs = request.user.teams.map((t) => t.slug);
    if (!isAdmin(teamSlugs)) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only engineer or product team members can create projects" },
      });
    }
    const body = request.body as any;
    try {
      const project = await createProject({
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
  });

  fastify.patch("/api/v1/projects/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const teamSlugs = request.user.teams.map((t) => t.slug);
    if (!(await canManageProject(id, request.user.id, teamSlugs))) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only the project owner or admins can edit this project" },
      });
    }
    try {
      return await updateProject(id, request.body as any);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  fastify.post("/api/v1/projects/:id/archive", async (request, reply) => {
    const { id } = request.params as { id: string };
    const teamSlugs = request.user.teams.map((t) => t.slug);
    if (!(await canManageProject(id, request.user.id, teamSlugs))) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only the project owner or admins can archive this project" },
      });
    }
    try {
      return await archiveProject(id, true);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  fastify.delete("/api/v1/projects/:id/archive", async (request, reply) => {
    const { id } = request.params as { id: string };
    const teamSlugs = request.user.teams.map((t) => t.slug);
    if (!(await canManageProject(id, request.user.id, teamSlugs))) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only the project owner or admins can unarchive this project" },
      });
    }
    try {
      return await archiveProject(id, false);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  fastify.post("/api/v1/projects/:id/teams", async (request, reply) => {
    const { id } = request.params as { id: string };
    const teamSlugs = request.user.teams.map((t) => t.slug);
    if (!(await canManageProject(id, request.user.id, teamSlugs))) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only the project owner or admins can modify teams" },
      });
    }
    const { teamId } = request.body as { teamId?: string };
    if (!teamId) {
      return reply.status(400).send({ error: { code: "BAD_REQUEST", message: "teamId is required" } });
    }
    try {
      return await addProjectTeam(id, teamId);
    } catch (err) {
      return handleError(reply, err);
    }
  });

  fastify.delete("/api/v1/projects/:id/teams/:teamId", async (request, reply) => {
    const { id, teamId } = request.params as { id: string; teamId: string };
    const teamSlugs = request.user.teams.map((t) => t.slug);
    if (!(await canManageProject(id, request.user.id, teamSlugs))) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "Only the project owner or admins can modify teams" },
      });
    }
    try {
      return await removeProjectTeam(id, teamId);
    } catch (err) {
      return handleError(reply, err);
    }
  });
}
