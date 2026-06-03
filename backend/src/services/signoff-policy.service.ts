import { prisma } from "../prisma-client.js";

// Pure helper — task ?? project ?? org, returns first non-null/undefined value.
export function pickEffectivePolicyId(
  taskPolicyId: string | null | undefined,
  projectPolicyId: string | null | undefined,
  orgPolicyId: string | null | undefined
): string | null {
  return taskPolicyId ?? projectPolicyId ?? orgPolicyId ?? null;
}

// Resolves the effective policy ID for a given task by walking task → project → org defaults.
export async function resolveEffectivePolicyId(taskId: string): Promise<string | null> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      defaultSignoffPolicyId: true,
      projects: {
        select: {
          project: {
            select: {
              defaultSignoffPolicyId: true,
              orgId: true,
            },
          },
        },
        take: 1,
      },
    },
  });
  if (!task) return null;

  if (task.defaultSignoffPolicyId) return task.defaultSignoffPolicyId;

  const project = task.projects[0]?.project;
  if (project?.defaultSignoffPolicyId) return project.defaultSignoffPolicyId;

  if (!project?.orgId) return null;

  const settings = await prisma.appSetting.findUnique({
    where: { orgId: project.orgId },
    select: { defaultSignoffPolicyId: true },
  });

  return settings?.defaultSignoffPolicyId ?? null;
}

// Copies a policy's slots by value into SignoffSlot rows for a given requirement.
// Immutable snapshot — later policy edits do not affect existing requirements.
export async function materializePolicySlots(policyId: string, requirementId: string): Promise<void> {
  const policy = await prisma.signoffPolicy.findUnique({
    where: { id: policyId },
    select: {
      slots: {
        orderBy: { ordinal: "asc" },
        select: { label: true, ordinal: true, requiredActorType: true, requiredUserId: true },
      },
    },
  });
  if (!policy || policy.slots.length === 0) return;

  await prisma.signoffSlot.createMany({
    data: policy.slots.map((s) => ({
      requirementId,
      ordinal: s.ordinal,
      label: s.label,
      requiredActorType: s.requiredActorType,
      requiredUserId: s.requiredUserId,
    })),
  });
}
