import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const userArg = process.env.FEEDBACK_SEED_USER_EMAIL;
  const user = userArg
    ? await prisma.user.findFirst({ where: { email: userArg } })
    : await prisma.user.findFirst({ where: { actorType: "human" }, orderBy: { createdAt: "asc" } });
  if (!user) throw new Error("No user found. Pass FEEDBACK_SEED_USER_EMAIL or seed users first.");

  const membership = await prisma.orgMember.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) throw new Error(`User ${user.email ?? user.id} has no org membership.`);
  const orgId = membership.orgId;

  const samples = [
    { type: "BUG", message: "Drag-and-drop on the board sometimes drops the card back into its original column. Repro: drag from Discuss → Design, release, refresh — card is back in Discuss.", page: "/tasks/feature", adminNotes: null, archivedAt: null },
    { type: "FEATURE", message: "Could we get a keyboard shortcut to jump directly to the global search box? Cmd+K is the obvious one. Currently I have to click into the header.", page: "/", adminNotes: "Possibly part of FEAT-41.", archivedAt: null },
    { type: "IMPROVEMENT", message: "The 'My Work' dashboard could use a clearer empty state — right now it just shows 'No tasks' which doesn't tell new users what to do next.", page: "/", adminNotes: null, archivedAt: null },
    { type: "BUG", message: "Email notifications about invitations are landing in spam for at least Gmail recipients. SPF/DKIM probably misconfigured.", page: "/organization", adminNotes: null, archivedAt: null },
    { type: "FEATURE", message: "Bulk assign — when triaging the backlog I'd love to multi-select tasks and assign them to a teammate in one go.", page: "/tasks/feature", adminNotes: "Defer — design phase first.", archivedAt: null },
    { type: "IMPROVEMENT", message: "The flow-status legend is hard to remember. A tiny hover tooltip per status pill would help newcomers a lot.", page: "/flows", adminNotes: null, archivedAt: null },
    { type: "BUG", message: "Hitting Escape inside the task-create modal closes the modal AND clears the parent search input behind it. Probably an event-bubbling thing.", page: "/tasks/new", adminNotes: "Reproduced. Fix queued.", archivedAt: new Date() },
    { type: "FEATURE", message: "Saved filters for the task board — I keep retyping the same 'mine + this sprint + this label' combo.", page: "/tasks/feature", adminNotes: null, archivedAt: null },
    { type: "IMPROVEMENT", message: "Tighten the row spacing on the Projects list — currently you can only fit five rows on a laptop screen and most teams have ~20 projects.", page: "/projects", adminNotes: null, archivedAt: new Date(Date.now() - 7 * 86400_000) },
    { type: "BUG", message: "Comments lose markdown formatting when you edit them and re-save — bullet lists collapse to a single line.", page: "/tasks/feature", adminNotes: null, archivedAt: null },
    { type: "FEATURE", message: "Slack integration: a /taskflow command that lists my open work without leaving Slack. We live in Slack and context-switching to the web app for a status check is heavy.", page: "/", adminNotes: null, archivedAt: null },
    { type: "IMPROVEMENT", message: "Dark mode! At least let me pin it — right now it follows the OS and switches mid-day when my OS does.", page: "/settings", adminNotes: null, archivedAt: null },
    { type: "BUG", message: "The PR-link button on the task detail page disappears when there's no linked PR but there should at least be an 'Add PR' affordance — currently it's a dead column.", page: "/tasks/feature", adminNotes: null, archivedAt: null },
    { type: "FEATURE", message: "Custom statuses per flow! Right now we're shoehorning everything into the four built-in ones, but our agency-style workflow needs 'Client review' and 'Awaiting copy'.", page: "/flows", adminNotes: null, archivedAt: null },
    { type: "IMPROVEMENT", message: "The mobile layout truncates priority pills. Either drop the word and keep just the dot, or wrap them onto a second line.", page: "/tasks/feature", adminNotes: null, archivedAt: null },
    { type: "BUG", message: "Pagination on the feedback admin view shows 'Page 1 of NaN' when there are zero items.", page: "/organization/feedback", adminNotes: "Just fixed in FEAT-16 — verify the Math.max guard.", archivedAt: null },
    { type: "FEATURE", message: "CSV import for projects when migrating from another tool. Right now seeding our existing project list one-by-one is a chore.", page: "/projects/new", adminNotes: null, archivedAt: null },
    { type: "IMPROVEMENT", message: "Task IDs in URLs would be more memorable if they used the displayId (FEAT-16) instead of the UUID.", page: "/tasks/feature", adminNotes: null, archivedAt: null },
    { type: "BUG", message: "Adding a comment while the task detail is loading sometimes posts the comment against the previous task that was open.", page: "/tasks/feature", adminNotes: null, archivedAt: null },
    { type: "FEATURE", message: "Email digest of overdue tasks every morning. Slack ping is great for real-time but a curated 8am digest would catch what fell through the cracks.", page: "/", adminNotes: "Nice-to-have, low priority.", archivedAt: null },
    { type: "IMPROVEMENT", message: "The 'Submit feedback' button styling — make it a touch larger on the floating bubble; on a 4k display it's a hard click target.", page: "/", adminNotes: null, archivedAt: null },
  ];

  const created = [];
  const now = Date.now();
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const createdAt = new Date(now - i * 6 * 3600_000); // staggered ~6h apart
    const row = await prisma.feedback.create({
      data: {
        orgId,
        userId: user.id,
        type: s.type,
        message: s.message,
        page: s.page,
        adminNotes: s.adminNotes,
        archivedAt: s.archivedAt,
        createdAt,
      },
    });
    created.push(row);
  }
  console.log(`Seeded ${created.length} feedback rows for org ${orgId} as user ${user.email ?? user.id}.`);
}

main().finally(() => prisma.$disconnect());
