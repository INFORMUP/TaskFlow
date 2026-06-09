import { FastifyInstance } from "fastify";
import { Type } from "@sinclair/typebox";
import { prisma } from "../prisma-client.js";
import { enforceScope } from "../services/permission.service.js";
import { CommonErrorResponses } from "./_schemas.js";
import { fileContentDisposition } from "../lib/content-disposition.js";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

const RequirementImageParams = Type.Object({
  id: Type.String({ format: "uuid" }),
  rid: Type.String({ format: "uuid" }),
});

const AttestationEvidenceParams = Type.Object({
  id: Type.String({ format: "uuid" }),
  rid: Type.String({ format: "uuid" }),
  sid: Type.String({ format: "uuid" }),
});

const ImageParams = Type.Object({
  imageId: Type.String({ format: "uuid" }),
});

const RequirementImageDeleteParams = Type.Object({
  id: Type.String({ format: "uuid" }),
  rid: Type.String({ format: "uuid" }),
  imageId: Type.String({ format: "uuid" }),
});

async function deleteImageIfOrphaned(imageId: string) {
  const [ti, ci, ri, ai] = await Promise.all([
    prisma.taskImage.count({ where: { imageId } }),
    prisma.commentImage.count({ where: { imageId } }),
    prisma.requirementImage.count({ where: { imageId } }),
    prisma.attestation.count({ where: { evidence: imageId } }),
  ]);
  if (ti + ci + ri + ai === 0) {
    await prisma.image.delete({ where: { id: imageId } });
  }
}

export async function imageRoutes(fastify: FastifyInstance) {
  // POST /api/v1/tasks/:id/requirements/:rid/images
  fastify.post(
    "/api/v1/tasks/:id/requirements/:rid/images",
    {
      schema: {
        summary: "Attach an image to a requirement",
        tags: ["requirements"],
        params: RequirementImageParams,
        response: {
          201: Type.Object(
            {
              id: Type.String({ format: "uuid" }),
              filename: Type.String(),
              mimeType: Type.String(),
              size: Type.Number(),
              createdAt: Type.String({ format: "date-time" }),
            },
            { additionalProperties: true }
          ),
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "requirements:write")) return;

      const { rid } = request.params as { id: string; rid: string };

      const req = await prisma.requirement.findFirst({
        where: { id: rid, isDeleted: false },
        select: { id: true },
      });
      if (!req) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Requirement not found" } });
      }

      const file = await (request as any).file();
      if (!file) {
        return reply.status(400).send({ error: { code: "BAD_REQUEST", message: "No file uploaded" } });
      }

      const mimeType: string = file.mimetype;
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return reply.status(415).send({
          error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Only image files are allowed" },
        });
      }

      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks);

      const image = await prisma.image.create({
        data: {
          filename: file.filename,
          mimeType,
          size: data.length,
          data,
          uploadedBy: request.user.id,
          requirementImages: { create: { requirementId: rid } },
        },
        select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
      });

      return reply.status(201).send({ ...image, createdAt: image.createdAt.toISOString() });
    }
  );

  // POST /api/v1/tasks/:id/requirements/:rid/slots/:sid/attestations/evidence-image
  fastify.post(
    "/api/v1/tasks/:id/requirements/:rid/slots/:sid/attestations/evidence-image",
    {
      schema: {
        summary: "Upload an evidence image for a human attestation",
        tags: ["requirements"],
        params: AttestationEvidenceParams,
        response: {
          201: Type.Object({ imageId: Type.String({ format: "uuid" }) }),
          ...CommonErrorResponses,
        },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "attestations:write")) return;

      const { sid } = request.params as { id: string; rid: string; sid: string };

      const slot = await prisma.signoffSlot.findFirst({
        where: { id: sid },
        select: { id: true, requiredActorType: true },
      });
      if (!slot) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Slot not found" } });
      }
      if (slot.requiredActorType === "agent") {
        return reply.status(403).send({ error: { code: "FORBIDDEN", message: "Agent-only slots do not accept human evidence" } });
      }

      const file = await (request as any).file();
      if (!file) {
        return reply.status(400).send({ error: { code: "BAD_REQUEST", message: "No file uploaded" } });
      }

      const mimeType: string = file.mimetype;
      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return reply.status(415).send({
          error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Only image files are allowed" },
        });
      }

      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks);

      const image = await prisma.image.create({
        data: {
          filename: file.filename,
          mimeType,
          size: data.length,
          data,
          uploadedBy: request.user.id,
        },
        select: { id: true },
      });

      return reply.status(201).send({ imageId: image.id });
    }
  );

  // GET /api/v1/images/:imageId  — serve the binary with proper content-type
  fastify.get(
    "/api/v1/images/:imageId",
    {
      schema: {
        summary: "Download an image by ID",
        tags: ["requirements"],
        params: ImageParams,
        response: { ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "tasks:read")) return;

      const { imageId } = request.params as { imageId: string };

      const image = await prisma.image.findUnique({
        where: { id: imageId },
        select: { data: true, mimeType: true, filename: true },
      });
      if (!image) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Image not found" } });
      }

      return reply
        .header("Content-Type", image.mimeType)
        .header("Content-Disposition", fileContentDisposition(image.filename, "inline"))
        .header("Cache-Control", "private, max-age=31536000, immutable")
        .send(image.data);
    }
  );

  // DELETE /api/v1/tasks/:id/requirements/:rid/images/:imageId
  fastify.delete(
    "/api/v1/tasks/:id/requirements/:rid/images/:imageId",
    {
      schema: {
        summary: "Remove an image from a requirement",
        tags: ["requirements"],
        params: RequirementImageDeleteParams,
        response: { 204: Type.Null(), ...CommonErrorResponses },
      },
    },
    async (request, reply) => {
      if (!enforceScope(request, reply, "requirements:write")) return;

      const { rid, imageId } = request.params as { id: string; rid: string; imageId: string };

      const join = await prisma.requirementImage.findUnique({
        where: { requirementId_imageId: { requirementId: rid, imageId } },
      });
      if (!join) {
        return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Image not found" } });
      }

      await prisma.requirementImage.delete({
        where: { requirementId_imageId: { requirementId: rid, imageId } },
      });
      await deleteImageIfOrphaned(imageId);

      return reply.status(204).send();
    }
  );
}

export { deleteImageIfOrphaned };
