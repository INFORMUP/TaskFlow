import { FastifyInstance } from "fastify";
import { Type, type Static } from "@sinclair/typebox";
import { prisma } from "../prisma-client.js";
import { canTransitionToStatus, enforceScope } from "../services/permission.service.js";
import { validateTransition, validateNote, validateResolution } from "../services/transition.service.js";
import { CommonErrorResponses, IdParams, UserSummary } from "./_schemas.js";

const StatusRef = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    slug: Type.String(),
    name: Type.String(),
  },
  { additionalProperties: true }
);

const TransitionRecord = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    fromStatus: Type.Union([StatusRef, Type.Null()]),
    toStatus: StatusRef,
    actor: UserSummary,
    actorType: Type.String(),
    note: Type.String(),
    newAssignee: Type.Union([UserSummary, Type.Null()]),
    createdAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: true }
);

const CreateTransitionBody = Type.Object({
  toStatus: Type.String({ minLength: 1 }),
  note: Type.Optional(Type.String()),
  resolution: Type.Optional(Type.String()),
  newAssigneeUserId: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
});

export async function transitionRoutes(fastify: FastifyInstance) {
  fastify.post<{ Params: { id: string }; Body: Static<typeof CreateTransitionBody> }>(
    "/api/v1/tasks/:id/transitions",
    {
      schema: {
        summary: "Transition a task to a new status",
        description:
          "Validates the transition against the task's flow graph. Closing transitions require a valid `resolution` for the flow. Returns 422 with `TRANSITION_NOT_ALLOWED`, `INVALID_STATUS`, `RESOLUTION_REQUIRED`, `INVALID_RESOLUTION`, or `INVALID_USER` on validation failures.",
        tags: ["transitions"],
        params: IdParams,
        body: CreateTransitionBody,
        response: {
          201: Type.Object({ success: Type.Literal(true) }, { additionalProperties: true }),
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "transitions:write")) return;
      const { id } = request.params;
      const { toStatus, note, resolution, newAssigneeUserId } = request.body;

      const noteResult = validateNote(note as string);
      if (!noteResult.valid) {
        return reply.status(422).send({
          error: { code: noteResult.error!, message: noteResult.message! },
        });
      }

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

      const targetStatus = await prisma.flowStatus.findFirst({
        where: { flowId: task.flowId, slug: toStatus },
      });

      if (!targetStatus) {
        return reply.status(422).send({
          error: { code: "INVALID_STATUS", message: `Unknown status: ${toStatus}` },
        });
      }

      const teamSlugs = request.user.teams.map((t) => t.slug);
      if (!canTransitionToStatus(teamSlugs, task.flow.slug, targetStatus.slug)) {
        return reply.status(403).send({
          error: { code: "FORBIDDEN", message: "You do not have permission to transition to this status" },
        });
      }

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

      if (newAssigneeUserId) {
        const assignee = await prisma.user.findUnique({ where: { id: newAssigneeUserId } });
        if (!assignee || assignee.status !== "active") {
          return reply.status(422).send({
            error: { code: "INVALID_USER", message: "New assignee must be an active user" },
          });
        }
      }

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

      return reply.status(201).send({ success: true as const });
    }
  );

  fastify.get<{ Params: { id: string } }>(
    "/api/v1/tasks/:id/transitions",
    {
      schema: {
        summary: "List a task's transition history",
        description: "Requires tasks:read scope. Returns transitions in chronological order.",
        tags: ["transitions"],
        params: IdParams,
        response: {
          200: Type.Object(
            { data: Type.Array(TransitionRecord) },
            { additionalProperties: true }
          ),
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:read")) return;
      const { id } = request.params;

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
          createdAt: t.createdAt.toISOString(),
        })),
      };
    }
  );
}
