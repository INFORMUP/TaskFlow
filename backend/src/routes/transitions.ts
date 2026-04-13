import { FastifyInstance } from "fastify";
import { prisma } from "../prisma-client.js";
import { canTransitionToStatus } from "../services/permission.service.js";
import { validateTransition, validateNote, validateResolution } from "../services/transition.service.js";

export async function transitionRoutes(fastify: FastifyInstance) {
  // Create transition
  fastify.post("/api/v1/tasks/:id/transitions", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { toStatus, note, resolution, newAssigneeUserId } = request.body as {
      toStatus?: string;
      note?: string;
      resolution?: string;
      newAssigneeUserId?: string | null;
    };

    // Validate note
    const noteResult = validateNote(note as string);
    if (!noteResult.valid) {
      return reply.status(422).send({
        error: { code: noteResult.error!, message: noteResult.message! },
      });
    }

    // Load task with flow info
    const task = await prisma.task.findFirst({
      where: { id, isDeleted: false },
      include: {
        flow: true,
        currentStatus: true,
      },
    });

    if (!task) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Task not found" },
      });
    }

    // Resolve target status
    const targetStatus = await prisma.flowStatus.findFirst({
      where: { flowId: task.flowId, slug: toStatus },
    });

    if (!targetStatus) {
      return reply.status(422).send({
        error: { code: "INVALID_STATUS", message: `Unknown status: ${toStatus}` },
      });
    }

    // Check transition permission
    const teamSlugs = request.user.teams.map((t) => t.slug);
    if (!canTransitionToStatus(teamSlugs, task.flow.slug, targetStatus.slug)) {
      return reply.status(403).send({
        error: { code: "FORBIDDEN", message: "You do not have permission to transition to this status" },
      });
    }

    // Validate transition is allowed
    const allowedTransitions = await prisma.flowTransition.findMany({
      where: { flowId: task.flowId },
    });

    const transResult = validateTransition(
      task.currentStatusId,
      targetStatus.id,
      allowedTransitions
    );

    if (!transResult.valid) {
      return reply.status(422).send({
        error: {
          code: transResult.error!,
          message: transResult.message!,
          details: {
            currentStatus: task.currentStatus.slug,
            requestedStatus: targetStatus.slug,
            allowedTransitions: transResult.allowedTargets,
          },
        },
      });
    }

    // Validate resolution if closing
    if (targetStatus.slug === "closed") {
      const resResult = validateResolution(task.flow.slug, resolution);
      if (!resResult.valid) {
        return reply.status(422).send({
          error: {
            code: resResult.error!,
            message: resResult.message!,
            ...(resResult.allowedResolutions && { details: { allowedResolutions: resResult.allowedResolutions } }),
          },
        });
      }
    }

    // Validate new assignee exists and is active if supplied
    if (newAssigneeUserId) {
      const assignee = await prisma.user.findUnique({ where: { id: newAssigneeUserId } });
      if (!assignee || assignee.status !== "active") {
        return reply.status(422).send({
          error: { code: "INVALID_USER", message: "New assignee must be an active user" },
        });
      }
    }

    // Create transition and update task atomically
    await prisma.$transaction(async (tx) => {
      await tx.taskTransition.create({
        data: {
          taskId: task.id,
          fromStatusId: task.currentStatusId,
          toStatusId: targetStatus.id,
          actorId: request.user.id,
          note: note!,
          actorType: request.user.actorType,
          newAssigneeId: newAssigneeUserId ?? null,
        },
      });

      await tx.task.update({
        where: { id: task.id },
        data: {
          currentStatusId: targetStatus.id,
          ...(targetStatus.slug === "closed" && { resolution }),
          ...(newAssigneeUserId !== undefined && { assigneeId: newAssigneeUserId ?? null }),
        },
      });
    });

    return reply.status(201).send({ success: true });
  });

  // Get transition history
  fastify.get("/api/v1/tasks/:id/transitions", async (request, reply) => {
    const { id } = request.params as { id: string };

    const task = await prisma.task.findFirst({
      where: { id, isDeleted: false },
    });

    if (!task) {
      return reply.status(404).send({
        error: { code: "NOT_FOUND", message: "Task not found" },
      });
    }

    const transitions = await prisma.taskTransition.findMany({
      where: { taskId: id },
      include: {
        fromStatus: { select: { id: true, slug: true, name: true } },
        toStatus: { select: { id: true, slug: true, name: true } },
        actor: { select: { id: true, displayName: true, actorType: true } },
        newAssignee: { select: { id: true, displayName: true, actorType: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return {
      data: transitions.map((t) => ({
        id: t.id,
        fromStatus: t.fromStatus,
        toStatus: t.toStatus,
        actor: t.actor,
        actorType: t.actorType,
        note: t.note,
        newAssignee: t.newAssignee,
        createdAt: t.createdAt,
      })),
    };
  });
}
