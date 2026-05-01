import { Prisma } from "@prisma/client";
import { prisma } from "../prisma-client.js";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export class LabelServiceError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export interface LabelRecord {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

function format(label: { id: string; name: string; color: string; createdAt: Date }): LabelRecord {
  return {
    id: label.id,
    name: label.name,
    color: label.color,
    createdAt: label.createdAt.toISOString(),
  };
}

function validateColor(color: string): void {
  if (!HEX_COLOR.test(color)) {
    throw new LabelServiceError("INVALID_COLOR", "Color must be a hex string like #RRGGBB", 400);
  }
}

function normalizeName(name: string): string {
  return name.trim();
}

export async function listLabels(orgId: string): Promise<LabelRecord[]> {
  const labels = await prisma.label.findMany({
    where: { orgId },
    orderBy: { name: "asc" },
  });
  return labels.map(format);
}

export async function createLabel(orgId: string, name: string, color: string): Promise<LabelRecord> {
  const trimmed = normalizeName(name);
  if (!trimmed) {
    throw new LabelServiceError("INVALID_NAME", "Label name is required", 400);
  }
  validateColor(color);

  // App-level case-insensitive uniqueness
  const existing = await prisma.label.findFirst({
    where: { orgId, name: { equals: trimmed, mode: "insensitive" } },
  });
  if (existing) {
    throw new LabelServiceError("DUPLICATE_NAME", "A label with this name already exists", 409);
  }

  try {
    const label = await prisma.label.create({
      data: { orgId, name: trimmed, color },
    });
    return format(label);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new LabelServiceError("DUPLICATE_NAME", "A label with this name already exists", 409);
    }
    throw err;
  }
}

export async function updateLabel(
  orgId: string,
  labelId: string,
  updates: { name?: string; color?: string },
): Promise<LabelRecord> {
  const existing = await prisma.label.findFirst({ where: { id: labelId, orgId } });
  if (!existing) {
    throw new LabelServiceError("NOT_FOUND", "Label not found", 404);
  }

  const data: { name?: string; color?: string } = {};

  if (updates.name !== undefined) {
    const trimmed = normalizeName(updates.name);
    if (!trimmed) {
      throw new LabelServiceError("INVALID_NAME", "Label name is required", 400);
    }
    if (trimmed.toLowerCase() !== existing.name.toLowerCase()) {
      const duplicate = await prisma.label.findFirst({
        where: { orgId, name: { equals: trimmed, mode: "insensitive" }, NOT: { id: labelId } },
      });
      if (duplicate) {
        throw new LabelServiceError("DUPLICATE_NAME", "A label with this name already exists", 409);
      }
    }
    data.name = trimmed;
  }

  if (updates.color !== undefined) {
    validateColor(updates.color);
    data.color = updates.color;
  }

  try {
    const label = await prisma.label.update({ where: { id: labelId }, data });
    return format(label);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new LabelServiceError("DUPLICATE_NAME", "A label with this name already exists", 409);
    }
    throw err;
  }
}

export async function deleteLabel(orgId: string, labelId: string): Promise<void> {
  const existing = await prisma.label.findFirst({ where: { id: labelId, orgId } });
  if (!existing) {
    throw new LabelServiceError("NOT_FOUND", "Label not found", 404);
  }
  await prisma.label.delete({ where: { id: labelId } });
}

export async function attachLabel(orgId: string, taskId: string, labelId: string): Promise<void> {
  const [task, label] = await Promise.all([
    prisma.task.findFirst({ where: { id: taskId, flow: { orgId } } }),
    prisma.label.findFirst({ where: { id: labelId, orgId } }),
  ]);
  if (!task) {
    throw new LabelServiceError("NOT_FOUND", "Task not found", 404);
  }
  if (!label) {
    throw new LabelServiceError("NOT_FOUND", "Label not found", 404);
  }

  await prisma.taskLabel.upsert({
    where: { taskId_labelId: { taskId, labelId } },
    update: {},
    create: { taskId, labelId },
  });
}

export async function detachLabel(orgId: string, taskId: string, labelId: string): Promise<void> {
  const task = await prisma.task.findFirst({ where: { id: taskId, flow: { orgId } } });
  if (!task) {
    throw new LabelServiceError("NOT_FOUND", "Task not found", 404);
  }
  await prisma.taskLabel.deleteMany({ where: { taskId, labelId } });
}
