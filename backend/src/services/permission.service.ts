type Action = "create" | "view" | "comment" | "transition" | "edit" | "assign" | "delete" | "admin";
type ViewScope = "all" | "assigned" | "own_public" | "none";

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
};

const SCOPE_PRIORITY: ViewScope[] = ["all", "own_public", "assigned", "none"];

export function canPerformAction(
  teamSlugs: string[],
  action: Action,
  flowSlug: string
): boolean {
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
