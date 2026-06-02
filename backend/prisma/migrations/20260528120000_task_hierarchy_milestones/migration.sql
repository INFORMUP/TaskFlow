-- Task hierarchy & milestones (FEAT-115, foundation layer).
--
-- 1. Adds `is_terminal` to flow_statuses and backfills every flow's `closed`
--    status as terminal. Milestone roll-up counts a child as "done" when it
--    sits in a terminal status.
-- 2. Seeds a new `milestone` container flow (open → closed, with reopen) and
--    attaches it to all existing projects so milestones are immediately
--    creatable on already-seeded databases.
--
-- The flow / status / transition / attachment rows use the precomputed
-- uuid5(`taskflow:seed:<entity>:<key>`) ids that backend/prisma/seeders produce,
-- so a fresh seeder run finds these rows and skips them instead of duplicating.
-- Each INSERT is guarded by `SELECT ... FROM <existing seeded row>`: on a fresh
-- pre-seed database the anchor rows don't exist yet, the SELECTs return nothing,
-- and the seeder populates everything afterward.

-- 1. New column + backfill of existing terminal statuses.
ALTER TABLE "flow_statuses" ADD COLUMN "is_terminal" BOOLEAN NOT NULL DEFAULT false;

UPDATE "flow_statuses" SET "is_terminal" = true WHERE "slug" = 'closed';

-- 2. Milestone flow, anchored to the seeded `feature` flow (gives us org_id and
--    a "this DB has been seeded" guard in one shot).
INSERT INTO "flows" ("id", "org_id", "slug", "name", "description", "icon", "created_at")
SELECT
  '9cba7819-6757-5d03-86df-e421f653f87a'::uuid,
  "org_id",
  'milestone',
  'Milestone',
  'Container that aggregates child tasks; status computed from children',
  'flag',
  NOW()
FROM "flows"
WHERE "id" = '33c6f220-009f-597f-93bb-991b6ecd02ce'::uuid;

-- 3. Milestone statuses: open (initial) and closed (terminal).
INSERT INTO "flow_statuses" ("id", "flow_id", "slug", "name", "description", "sort_order", "color", "is_terminal", "created_at")
SELECT
  '161eabc6-7c18-5364-936e-1a2fa25b4a63'::uuid,
  "id",
  'open',
  'Open',
  'Milestone is active; progress is computed from its child tasks',
  1,
  '#3b82f6',
  false,
  NOW()
FROM "flows"
WHERE "id" = '9cba7819-6757-5d03-86df-e421f653f87a'::uuid;

INSERT INTO "flow_statuses" ("id", "flow_id", "slug", "name", "description", "sort_order", "color", "is_terminal", "created_at")
SELECT
  'fed0cd9d-7e10-58fa-b998-e9db2297fe39'::uuid,
  "id",
  'closed',
  'Closed',
  'Milestone closed (all children done, or manually closed early)',
  2,
  '#6b7280',
  true,
  NOW()
FROM "flows"
WHERE "id" = '9cba7819-6757-5d03-86df-e421f653f87a'::uuid;

-- 4. Milestone transitions: open → closed and the closed → open reopen.
INSERT INTO "flow_transitions" ("id", "flow_id", "from_status_id", "to_status_id")
SELECT
  'c4ecc783-732f-52bc-8f9b-d4c93438cf0e'::uuid,
  "flow_id",
  '161eabc6-7c18-5364-936e-1a2fa25b4a63'::uuid,
  'fed0cd9d-7e10-58fa-b998-e9db2297fe39'::uuid
FROM "flow_statuses"
WHERE "id" = '161eabc6-7c18-5364-936e-1a2fa25b4a63'::uuid;

INSERT INTO "flow_transitions" ("id", "flow_id", "from_status_id", "to_status_id")
SELECT
  '68cfbc81-417a-58fd-bf93-45a4c8d87076'::uuid,
  "flow_id",
  'fed0cd9d-7e10-58fa-b998-e9db2297fe39'::uuid,
  '161eabc6-7c18-5364-936e-1a2fa25b4a63'::uuid
FROM "flow_statuses"
WHERE "id" = 'fed0cd9d-7e10-58fa-b998-e9db2297fe39'::uuid;

-- 5. Attach the milestone flow to every existing project so milestones can be
--    created right away. No-op on a fresh DB (no projects yet); the seeder wires
--    fresh projects up itself.
INSERT INTO "project_flows" ("project_id", "flow_id", "created_at")
SELECT "p"."id", '9cba7819-6757-5d03-86df-e421f653f87a'::uuid, NOW()
FROM "projects" "p"
WHERE EXISTS (SELECT 1 FROM "flows" WHERE "id" = '9cba7819-6757-5d03-86df-e421f653f87a'::uuid)
ON CONFLICT ("project_id", "flow_id") DO NOTHING;
