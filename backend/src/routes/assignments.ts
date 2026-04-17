import { FastifyInstance } from "fastify";
import { Type, type Static } from "@sinclair/typebox";
import { prisma } from "../prisma-client.js";
import { canPerformAction, enforceScope } from "../services/permission.service.js";
import { CommonErrorResponses, IdParams } from "./_schemas.js";

const AssignBody = Type.Object({
  assigneeId: Type.String({ format: "uuid" }),
  note: Type.Optional(Type.String({ minLength: 1 })),
});

const SuccessResponse = Type.Object(
  { success: Type.Literal(true) },
  { additionalProperties: true }
);

export async function assignmentRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string }; Body: Static<typeof AssignBody> }>(
    "/api/v1/tasks/:id/assign",
    {
      schema: {
        summary: "Assign a task to a user",
        description:
          "Sets `assigneeId` on the task. Optional `note` creates a comment. Requires tasks:write scope and the `assign` permission for the task's flow.",
        tags: ["assignments"],
        params: IdParams,
        body: AssignBody,
        response: { 200: SuccessResponse, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:write")) return;
      const { id } = request.params;
      const { assigneeId, note } = request.body;

      const task = await prisma.task.findFirst({
        where: { id, isDeleted: false, flow: { orgId: request.org.id } },
        include: { flow: true },
      });

      if (!task) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Task not found" },
        });
      }

      const teamSlugs = request.user.teams.map((t) => t.slug);
      if (!canPerformAction(teamSlugs, "assign", task.flow.slug)) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "You do not have permission to assign this task" },
        });
      }

      const assignee = await prisma.user.findFirst({
        where: {
          id: assigneeId,
          orgMemberships: { some: { orgId: request.org.id } },
        },
      });
      if (!assignee) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Assignee not found" },
        });
      }

      if (assignee.status !== "active") {
        return reply.status(422).send({
          error: { code: "INVALID_ASSIGNEE", message: "Cannot assign to deactivated user" },
        });
      }

      await prisma.task.update({
        where: { id },
        data: { assigneeId },
      });

      if (note) {
        await prisma.comment.create({
          data: {
            taskId: id,
            authorId: request.user.id,
            body: note,
          },
        });
      }

      return { success: true as const };
    }
  );

  fastify.delete<{ Params: { id: string } }>(
    "/api/v1/tasks/:id/assign",
    {
      schema: {
        summary: "Unassign a task",
        description: "Clears the task's assignee. Requires tasks:write scope and `assign` permission for the flow.",
        tags: ["assignments"],
        params: IdParams,
        response: { 200: SuccessResponse, ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:write")) return;
      const { id } = request.params;

      const task = await prisma.task.findFirst({
        where: { id, isDeleted: false, flow: { orgId: request.org.id } },
        include: { flow: true },
      });

      if (!task) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Task not found" },
        });
      }

      const teamSlugs = request.user.teams.map((t) => t.slug);
      if (!canPerformAction(teamSlugs, "assign", task.flow.slug)) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "You do not have permission to unassign this task" },
        });
      }

      await prisma.task.update({
        where: { id },
        data: { assigneeId: null },
      });

      return { success: true as const };
    }
  );
}
