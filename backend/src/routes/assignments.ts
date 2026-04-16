import { FastifyInstance } from "fastify";
import { prisma } from "../prisma-client.js";
import { canPerformAction, enforceScope } from "../services/permission.service.js";

export async function assignmentRoutes(fastify: FastifyInstance) {
  // Assign task
  fastify.post("/api/v1/tasks/:id/assign", async (request, reply) => {
    if (!enforceScope(request, reply, "tasks:write")) return;
    const { id } = request.params as { id: string };
    const { assigneeId, note } = request.body as { assigneeId?: string; note?: string };

    const task = await prisma.task.findFirst({
      where: { id, isDeleted: false },
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

    if (!assigneeId) {
      return reply.status(400).send({
        error: { code: "BAD_REQUEST", message: "assigneeId is required" },
      });
    }

    // Validate assignee exists and is active
    const assignee = await prisma.user.findUnique({ where: { id: assigneeId } });
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

    // If note provided, create a comment
    if (note) {
      await prisma.comment.create({
        data: {
          taskId: id,
          authorId: request.user.id,
          body: note,
        },
      });
    }

    return { success: true };
  });

  // Unassign task
  fastify.delete("/api/v1/tasks/:id/assign", async (request, reply) => {
    if (!enforceScope(request, reply, "tasks:write")) return;
    const { id } = request.params as { id: string };

    const task = await prisma.task.findFirst({
      where: { id, isDeleted: false },
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

    return { success: true };
  });
}
