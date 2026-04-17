export class OrgScopeError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
  }
}

export function orgScopedWhere(orgId: string, extra: Record<string, unknown> = {}) {
  return { orgId, ...extra };
}

export function requireSameOrg(
  entity: { orgId: string } | null | undefined,
  orgId: string,
  label = "Resource",
): asserts entity is { orgId: string } {
  if (!entity || entity.orgId !== orgId) {
    throw new OrgScopeError("NOT_FOUND", `${label} not found`, 404);
  }
}
