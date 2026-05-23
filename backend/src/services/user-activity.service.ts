import { prisma } from "../prisma-client.js";
import { buildTaskViewWhere } from "./permission.service.js";

export class UserActivityError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export interface ViewerContext {
  teamSlugs: string[];
  userId: string;
  flowIdBySlug: Map<string, string>;
}

export interface ListUserActivityParams {
  projectId?: string;
  from?: string;
  to?: string;
  limit: number;
  cursor?: string;
}

export type ActivityEventType = "task_created" | "status_transition" | "comment";

interface ActivityTaskRef {
  id: string;
  displayId: string;
  title: string;
  flow: { id: string; slug: string; name: string };
}

interface ActivityStatusRef {
  id: string;
  slug: string;
  name: string;
  color: string | null;
}

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  timestamp: string;
  task: ActivityTaskRef;
  fromStatus?: ActivityStatusRef | null;
  toStatus?: ActivityStatusRef;
  commentId?: string;
  bodyPreview?: string;
}

const BODY_PREVIEW_MAX = 140;

const taskSelect = {
  id: true,
  displayId: true,
  title: true,
  flow: { select: { id: true, slug: true, name: true } },
} as const;

const statusSelect = { id: true, slug: true, name: true, color: true } as const;

function parseDate(value: string | undefined, field: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new UserActivityError("INVALID_DATE", `${field} must be an ISO timestamp`, 400);
  }
  return d;
}

function truncate(body: string): string {
  const s = body.trim();
  return s.length > BODY_PREVIEW_MAX ? `${s.slice(0, BODY_PREVIEW_MAX)}…` : s;
}

function taskRef(task: {
  id: string;
  displayId: string;
  title: string;
  flow: { id: string; slug: string; name: string };
}): ActivityTaskRef {
  return {
    id: task.id,
    displayId: task.displayId,
    title: task.title,
    flow: { id: task.flow.id, slug: task.flow.slug, name: task.flow.name },
  };
}

function statusRef(status: {
  id: string;
  slug: string;
  name: string;
  color: string | null;
}): ActivityStatusRef {
  return { id: status.id, slug: status.slug, name: status.name, color: status.color };
}

async function loadTargetUserOrThrow(orgId: string, userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, status: "active", orgMemberships: { some: { orgId } } },
    select: { id: true, displayName: true, actorType: true },
  });
  if (!user) {
    throw new UserActivityError("NOT_FOUND", "User not found", 404);
  }
  return user;
}

export async function listUserActivity(
  orgId: string,
  targetUserId: string,
  params: ListUserActivityParams,
  viewer: ViewerContext,
) {
  const user = await loadTargetUserOrThrow(orgId, targetUserId);

  const cursorDate = parseDate(params.cursor, "cursor");
  const fromDate = parseDate(params.from, "from");
  const toDate = parseDate(params.to, "to");

  const createdAtFilter: { lt?: Date; gte?: Date; lte?: Date } = {};
  if (cursorDate) createdAtFilter.lt = cursorDate;
  if (fromDate) createdAtFilter.gte = fromDate;
  if (toDate) createdAtFilter.lte = toDate;
  const hasCreatedAt = Object.keys(createdAtFilter).length > 0;

  const taskWhere = buildTaskViewWhere(viewer.teamSlugs, viewer.userId, viewer.flowIdBySlug);
  // Constraint applied to the related task for every event source: only tasks the
  // viewer is allowed to see, never soft-deleted, optionally scoped to one project.
  const visibleTask: Record<string, unknown> = { isDeleted: false, ...taskWhere };
  if (params.projectId) {
    visibleTask.projects = { some: { projectId: params.projectId } };
  }

  const take = params.limit + 1;

  const createdWhere: Record<string, unknown> = {
    ...visibleTask,
    createdBy: targetUserId,
  };
  if (hasCreatedAt) createdWhere.createdAt = createdAtFilter;

  const transitionWhere: Record<string, unknown> = {
    actorId: targetUserId,
    task: visibleTask,
  };
  if (hasCreatedAt) transitionWhere.createdAt = createdAtFilter;

  const commentWhere: Record<string, unknown> = {
    authorId: targetUserId,
    isDeleted: false,
    task: visibleTask,
  };
  if (hasCreatedAt) commentWhere.createdAt = createdAtFilter;

  const [createdTasks, transitions, comments] = await Promise.all([
    prisma.task.findMany({
      where: createdWhere,
      select: { ...taskSelect, createdAt: true },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.taskTransition.findMany({
      where: transitionWhere,
      select: {
        id: true,
        createdAt: true,
        task: { select: taskSelect },
        fromStatus: { select: statusSelect },
        toStatus: { select: statusSelect },
      },
      orderBy: { createdAt: "desc" },
      take,
    }),
    prisma.comment.findMany({
      where: commentWhere,
      select: { id: true, body: true, createdAt: true, task: { select: taskSelect } },
      orderBy: { createdAt: "desc" },
      take,
    }),
  ]);

  const merged: { ts: Date; event: ActivityEvent }[] = [];
  for (const t of createdTasks) {
    merged.push({
      ts: t.createdAt,
      event: {
        id: `task_created:${t.id}`,
        type: "task_created",
        timestamp: t.createdAt.toISOString(),
        task: taskRef(t),
      },
    });
  }
  for (const tr of transitions) {
    merged.push({
      ts: tr.createdAt,
      event: {
        id: `status_transition:${tr.id}`,
        type: "status_transition",
        timestamp: tr.createdAt.toISOString(),
        task: taskRef(tr.task),
        fromStatus: tr.fromStatus ? statusRef(tr.fromStatus) : null,
        toStatus: statusRef(tr.toStatus),
      },
    });
  }
  for (const c of comments) {
    merged.push({
      ts: c.createdAt,
      event: {
        id: `comment:${c.id}`,
        type: "comment",
        timestamp: c.createdAt.toISOString(),
        task: taskRef(c.task),
        commentId: c.id,
        bodyPreview: truncate(c.body),
      },
    });
  }

  // Newest-first, with a stable secondary key so events sharing a timestamp
  // keep a deterministic order across requests.
  merged.sort((a, b) => {
    const d = b.ts.getTime() - a.ts.getTime();
    if (d !== 0) return d;
    if (a.event.id < b.event.id) return 1;
    if (a.event.id > b.event.id) return -1;
    return 0;
  });

  const hasMore = merged.length > params.limit;
  const page = merged.slice(0, params.limit);
  const nextCursor =
    hasMore && page.length > 0 ? page[page.length - 1].event.timestamp : null;

  return {
    user,
    data: page.map((m) => m.event),
    pagination: { cursor: nextCursor, hasMore },
  };
}
