import { PrismaClient } from "@prisma/client";
import { seedUuid, makeResult, SeederResult } from "./common.js";

const USER_ID_MAX = "a4faad20-55aa-46e1-98c2-2bb8bb6647d8";

const BUGS = [
  { key: "bug-1", title: "Login session expires after 5 minutes instead of 1 hour", priority: "critical", status: "triage", description: "Users are being logged out far too quickly. JWT expiry seems misconfigured in production." },
  { key: "bug-2", title: "Task board doesn't refresh after status transition", priority: "high", status: "investigate", description: "After moving a task to a new status via the API, the board still shows the old status until a full page reload." },
  { key: "bug-3", title: "Duplicate display IDs generated under concurrent writes", priority: "high", status: "approve", description: "When two tasks are created simultaneously, they occasionally receive the same display_id, causing a unique constraint violation." },
  { key: "bug-4", title: "Comment timestamps show UTC instead of user timezone", priority: "medium", status: "resolve", description: "All comment created_at values display in UTC. Should respect the user's timezone preference." },
  { key: "bug-5", title: "Agent transitions fail silently when note is empty string", priority: "medium", status: "validate", description: "The transition endpoint returns 200 but the transition isn't recorded when the note field is an empty string rather than null." },
  { key: "bug-6", title: "Search returns soft-deleted tasks", priority: "low", status: "triage", description: "Tasks with is_deleted=true still appear in search results and task lists." },
  { key: "bug-7", title: "Mobile layout breaks on task detail view", priority: "medium", status: "closed", description: "The task detail view overflows horizontally on screens narrower than 400px.", resolution: "fixed" },
  { key: "bug-8", title: "Refresh token rotation not invalidating old tokens", priority: "high", status: "investigate", description: "After a token refresh, the old refresh token can still be used to obtain new access tokens." },
];

const FEATURES = [
  { key: "feat-1", title: "Email notifications for task assignments", priority: "high", status: "discuss", description: "Users should receive an email when a task is assigned to them or when a task they're watching changes status." },
  { key: "feat-2", title: "Bulk task status transitions", priority: "medium", status: "design", description: "Allow selecting multiple tasks and transitioning them to a new status in one operation. Must respect transition rules." },
  { key: "feat-3", title: "Agent auto-triage for incoming bugs", priority: "high", status: "prototype", description: "An AI agent should automatically categorize and prioritize new bug reports based on description, stack traces, and historical patterns." },
  { key: "feat-4", title: "Dashboard with team workload metrics", priority: "medium", status: "implement", description: "A dashboard showing tasks per team member, average time in each status, and throughput over the last 30 days." },
  { key: "feat-5", title: "Webhook integrations for Slack and Discord", priority: "low", status: "discuss", description: "Fire webhooks on task events so teams can get notifications in their preferred chat platform." },
  { key: "feat-6", title: "Custom flow builder UI", priority: "high", status: "design", description: "Allow product managers to visually create and edit flows, statuses, and transitions without touching the database." },
];

const IMPROVEMENTS = [
  { key: "imp-1", title: "Migrate from localStorage to httpOnly cookies for tokens", priority: "high", status: "propose", description: "Storing JWTs in localStorage is vulnerable to XSS. Move to httpOnly secure cookies for better security posture." },
  { key: "imp-2", title: "Add request-level logging with correlation IDs", priority: "medium", status: "approve", description: "Every request should get a unique correlation ID propagated through logs for easier debugging across services." },
  { key: "imp-3", title: "Optimize task list query with cursor-based pagination", priority: "medium", status: "implement", description: "Current offset pagination degrades on large datasets. Switch to cursor-based pagination using created_at + id." },
  { key: "imp-4", title: "Extract permission logic into a policy engine", priority: "low", status: "propose", description: "The current static permission matrix in permission.service.ts is becoming hard to maintain. Consider a more flexible policy engine." },
  { key: "imp-5", title: "Add database connection pooling with PgBouncer", priority: "high", status: "validate", description: "Under load, Prisma opens too many connections. PgBouncer in transaction mode would cap connections and improve reliability." },
];

interface TaskDef {
  key: string;
  title: string;
  priority: string;
  status: string;
  description: string;
  resolution?: string;
}

async function seedFlowTasks(
  prisma: PrismaClient,
  flowSlug: string,
  tasks: TaskDef[],
  result: SeederResult
) {
  const flow = await prisma.flow.findUnique({ where: { slug: flowSlug } });
  if (!flow) throw new Error(`Flow '${flowSlug}' not found`);

  const statuses = await prisma.flowStatus.findMany({ where: { flowId: flow.id } });
  const statusMap = new Map(statuses.map((s) => [s.slug, s.id]));

  let counter = result.created + result.skipped;

  for (const task of tasks) {
    const id = seedUuid("task", task.key);
    const existing = await prisma.task.findUnique({ where: { id } });
    if (existing) {
      result.skipped++;
      counter++;
      continue;
    }

    const statusId = statusMap.get(task.status);
    if (!statusId) throw new Error(`Status '${task.status}' not found in flow '${flowSlug}'`);

    const prefix = flowSlug === "bug" ? "BUG" : flowSlug === "feature" ? "FEAT" : "IMP";
    counter++;
    const displayId = `${prefix}-${String(counter).padStart(3, "0")}`;

    await prisma.task.create({
      data: {
        id,
        displayId,
        flowId: flow.id,
        currentStatusId: statusId,
        title: task.title,
        description: task.description,
        priority: task.priority,
        resolution: task.resolution ?? null,
        createdBy: USER_ID_MAX,
      },
    });
    result.created++;
  }
}

export async function seedSampleTasks(prisma: PrismaClient): Promise<SeederResult[]> {
  // Ensure Max is on the engineer team
  const engineerTeamId = seedUuid("team", "engineer");
  await prisma.userTeam.upsert({
    where: { userId_teamId: { userId: USER_ID_MAX, teamId: engineerTeamId } },
    update: {},
    create: { userId: USER_ID_MAX, teamId: engineerTeamId, isPrimary: true },
  });

  const bugResult = makeResult("sample_bugs");
  const featResult = makeResult("sample_features");
  const impResult = makeResult("sample_improvements");

  await seedFlowTasks(prisma, "bug", BUGS, bugResult);
  await seedFlowTasks(prisma, "feature", FEATURES, featResult);
  await seedFlowTasks(prisma, "improvement", IMPROVEMENTS, impResult);

  // Seed some comments on a few tasks
  const commentResult = makeResult("sample_comments");
  const comments = [
    { taskKey: "bug-1", body: "Confirmed this is happening in production. Checked the JWT config — looks like the env var is being overridden somewhere." },
    { taskKey: "bug-1", body: "Found it. The Docker image bakes in a default .env that sets expiry to 300s. Need to fix the Dockerfile." },
    { taskKey: "bug-3", body: "This is a race condition in the display ID generator. We need a database sequence or advisory lock." },
    { taskKey: "feat-3", body: "I've spiked a prototype using Claude. It gets priority right about 80% of the time on our historical data." },
    { taskKey: "feat-4", body: "Design mockups are in Figma. The main question is whether we aggregate in real-time or use materialized views." },
    { taskKey: "imp-1", body: "This is a security priority. We should also add CSRF protection when we switch to cookies." },
  ];

  for (const c of comments) {
    const taskId = seedUuid("task", c.taskKey);
    const commentId = seedUuid("comment", `${c.taskKey}-${commentResult.created}`);
    const existing = await prisma.comment.findUnique({ where: { id: commentId } });
    if (existing) {
      commentResult.skipped++;
      continue;
    }
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      commentResult.skipped++;
      continue;
    }
    await prisma.comment.create({
      data: { id: commentId, taskId, authorId: USER_ID_MAX, body: c.body },
    });
    commentResult.created++;
  }

  return [bugResult, featResult, impResult, commentResult];
}
