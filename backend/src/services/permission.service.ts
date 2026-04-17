type Action = "create" | "view" | "comment" | "transition" | "edit" | "assign" | "delete" | "admin";
type ViewScope = "all" | "assigned" | "own_public" | "none";

export type TokenScope =
  | "tasks:read"
  | "tasks:write"
  | "transitions:write"
  | "comments:write";

export const ALL_TOKEN_SCOPES: TokenScope[] = [
  "tasks:read",
  "tasks:write",
  "transitions:write",
  "comments:write",
];

// A session's effective scopes are the intersection of the token's scopes
// with what the user's teams already allow. JWT sessions have `scopes === null`,
// meaning no scope gating (full access subject to team permissions).
export function hasScope(
  sessionScopes: string[] | null,
  required: TokenScope
): boolean {
  if (sessionScopes === null) return true;
  return sessionScopes.includes(required);
}

// Route helper: returns true if the request carries the required scope.
// Otherwise sends a 403 INSUFFICIENT_SCOPE response and returns false so
// the caller can early-return.
export function enforceScope(
  request: { user: { scopes: string[] | null } },
  reply: {
    status: (code: number) => { send: (body: unknown) => unknown };
  },
  scope: TokenScope
): boolean {
  if (hasScope(request.user.scopes, scope)) return true;
  reply.status(403).send({
    error: { code: "INSUFFICIENT_SCOPE", message: `API token lacks required scope: ${scope}` },
  });
  return false;
}

// Permission matrix: PERMISSIONS[flow][team][action] = boolean
// Derived from docs/permissions.md
const PERMISSIONS: Record<string, Record<string, Partial<Record<Action, boolean>>>> = {
  bug: {
    engineer: { create: true, view: true, comment: true, transition: true, edit: true, assign: true, delete: true },
    product:  { create: true, view: true, comment: true, transition: true, edit: true, assign: true, delete: true },
    user:     { create: true, view: true, comment: true },
    agent:    { create: true, view: true, comment: true, transition: true, edit: true },
  },
  feature: {
    engineer: { create: true, view: true, comment: true, transition: true, edit: true, assign: true },
    product:  { create: true, view: true, comment: true, transition: true, edit: true, assign: true, delete: true },
    user:     { create: true, view: true, comment: true },
    agent:    { view: true, comment: true, transition: true, edit: true },
  },
  improvement: {
    engineer: { create: true, view: true, comment: true, transition: true, edit: true, assign: true, delete: true },
    product:  { view: true, comment: true },
    user:     {},
    agent:    { create: true, view: true, comment: true, transition: true, edit: true },
  },
  "grant-application": {
    engineer: { view: true, comment: true },
    product:  { create: true, view: true, comment: true, transition: true, edit: true, assign: true, delete: true },
    user:     { view: true, comment: true },
    agent:    { view: true, comment: true },
  },
  "donor-outreach": {
    engineer: { view: true, comment: true },
    product:  { create: true, view: true, comment: true, transition: true, edit: true, assign: true, delete: true },
    user:     { view: true, comment: true },
    agent:    { view: true, comment: true },
  },
  event: {
    engineer: { view: true, comment: true },
    product:  { create: true, view: true, comment: true, transition: true, edit: true, assign: true, delete: true },
    user:     { view: true, comment: true },
    agent:    { view: true, comment: true },
  },
};

// View scope: what subset of tasks a team member can see
const VIEW_SCOPES: Record<string, Record<string, ViewScope>> = {
  bug: {
    engineer: "all",
    product: "all",
    user: "own_public",
    agent: "assigned",
  },
  feature: {
    engineer: "all",
    product: "all",
    user: "own_public",
    agent: "assigned",
  },
  improvement: {
    engineer: "all",
    product: "all",
    user: "none",
    agent: "assigned",
  },
  "grant-application": {
    engineer: "all",
    product: "all",
    user: "own_public",
    agent: "none",
  },
  "donor-outreach": {
    engineer: "all",
    product: "all",
    user: "own_public",
    agent: "none",
  },
  event: {
    engineer: "all",
    product: "all",
    user: "own_public",
    agent: "none",
  },
};

// Transition permissions: which teams can transition TO a given status
// TRANSITION_PERMISSIONS[flow][toStatus] = allowed team slugs
const TRANSITION_PERMISSIONS: Record<string, Record<string, string[]>> = {
  bug: {
    triage:      ["engineer", "product", "agent"],
    investigate: ["engineer", "agent"],
    approve:     ["engineer", "agent"],
    resolve:     ["engineer"],
    validate:    ["engineer", "agent"],
    closed:      ["engineer", "product"],
  },
  feature: {
    discuss:   ["product", "user"],
    design:    ["product"],
    prototype: ["engineer", "agent"],
    implement: ["engineer", "agent"],
    validate:  ["engineer", "agent"],
    review:    ["engineer", "product"],
    closed:    ["product", "engineer"],
  },
  improvement: {
    propose:   ["engineer", "agent"],
    approve:   ["engineer"],
    implement: ["engineer", "agent"],
    validate:  ["engineer", "agent"],
    closed:    ["engineer"],
  },
  "grant-application": {
    research:  ["product"],
    draft:     ["product"],
    submitted: ["product"],
    awarded:   ["product"],
    closed:    ["product"],
  },
  "donor-outreach": {
    identify:  ["product"],
    contact:   ["product"],
    engaged:   ["product"],
    committed: ["product"],
    closed:    ["product"],
  },
  event: {
    plan:    ["product"],
    promote: ["product"],
    host:    ["product"],
    recap:   ["product"],
    closed:  ["product"],
  },
};

const SCOPE_PRIORITY: ViewScope[] = ["all", "own_public", "assigned", "none"];

export type OrgRole = "owner" | "admin" | "member";

// Org owner/admin implicitly has every team-level permission within the org.
// A member inherits only from their explicit team memberships.
export function orgRoleGrantsAll(orgRole: OrgRole | undefined): boolean {
  return orgRole === "owner" || orgRole === "admin";
}

export function canPerformAction(
  teamSlugs: string[],
  action: Action,
  flowSlug: string,
  orgRole?: OrgRole,
): boolean {
  if (orgRoleGrantsAll(orgRole)) return true;

  const flowPerms = PERMISSIONS[flowSlug];
  if (!flowPerms) return false;

  return teamSlugs.some((team) => {
    const teamPerms = flowPerms[team];
    return teamPerms?.[action] === true;
  });
}

export function canTransitionToStatus(
  teamSlugs: string[],
  flowSlug: string,
  toStatusSlug: string
): boolean {
  const flowTransitions = TRANSITION_PERMISSIONS[flowSlug];
  if (!flowTransitions) return false;

  const allowedTeams = flowTransitions[toStatusSlug];
  if (!allowedTeams) return false;

  return teamSlugs.some((team) => allowedTeams.includes(team));
}

export function getViewScope(
  teamSlugs: string[],
  flowSlug: string
): ViewScope {
  const flowScopes = VIEW_SCOPES[flowSlug];
  if (!flowScopes) return "none";

  let bestScope: ViewScope = "none";

  for (const team of teamSlugs) {
    const scope = flowScopes[team];
    if (!scope) continue;
    if (SCOPE_PRIORITY.indexOf(scope) < SCOPE_PRIORITY.indexOf(bestScope)) {
      bestScope = scope;
    }
  }

  return bestScope;
}

// Build a Prisma `where` fragment that restricts a task query to what the
// user is allowed to see, given their teams across every flow. The result
// should be spread alongside any other filters the caller wants to AND with.
export function buildTaskViewWhere(
  teamSlugs: string[],
  userId: string,
  flowIdBySlug: Map<string, string>
): Record<string, unknown> {
  const clauses: Record<string, unknown>[] = [];

  for (const [slug, flowId] of flowIdBySlug) {
    const scope = getViewScope(teamSlugs, slug);
    if (scope === "none") continue;
    if (scope === "all") {
      clauses.push({ flowId });
    } else if (scope === "own_public") {
      clauses.push({ flowId, createdBy: userId });
    } else if (scope === "assigned") {
      clauses.push({ flowId, assigneeId: userId });
    }
  }

  if (clauses.length === 0) {
    return { id: { in: [] } };
  }

  return { OR: clauses };
}
