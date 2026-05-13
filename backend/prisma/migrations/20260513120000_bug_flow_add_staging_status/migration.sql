-- Add a `staging` status to the bug flow, slotted between `validate` and
-- `closed`. The semantics mirror the feature flow's staging stage: a bug has
-- passed validation and the fix is staged for release, awaiting promotion to
-- main.
--
-- IDs below are the precomputed uuid5(`taskflow:seed:<entity>:<key>`, uuid5.URL)
-- values matching backend/prisma/seeders/common.ts, so a fresh seeder run finds
-- these rows and skips them instead of inserting duplicates.

-- 1. Bump bug:closed's sort_order from 6 to 7 to make room for staging.
--    (Done first to avoid colliding with the unique (flow_id, sort_order)
--    constraint if one is ever added.)
UPDATE flow_statuses
SET sort_order = 7
WHERE id = 'd891bd28-b61b-5135-9a87-241d99fa5594'::uuid;

-- 2. Insert the new bug:staging flow_status at sort_order 6.
INSERT INTO flow_statuses (id, flow_id, slug, name, description, sort_order, color, created_at)
SELECT
  'bef6e3cf-9b8c-5c2f-be00-a3f312ab048c'::uuid,
  flow_id,
  'staging',
  'Staging',
  'Fix is staged for release',
  6,
  '#22c55e',
  NOW()
FROM flow_statuses
WHERE id = '894fa035-4c05-5af0-a537-bfe14546f0e3'::uuid;

-- 3. Insert the new flow_transitions for the inserted staging stage:
--    validate → staging (forward), staging → closed (forward),
--    staging → validate (backward bounce).
--    (flow_transitions has no created_at column — see schema.prisma.)
INSERT INTO flow_transitions (id, flow_id, from_status_id, to_status_id)
SELECT
  '0413b05f-8797-5bef-a3a8-79f14676bb77'::uuid,
  flow_id,
  '894fa035-4c05-5af0-a537-bfe14546f0e3'::uuid,
  'bef6e3cf-9b8c-5c2f-be00-a3f312ab048c'::uuid
FROM flow_statuses
WHERE id = '894fa035-4c05-5af0-a537-bfe14546f0e3'::uuid;

INSERT INTO flow_transitions (id, flow_id, from_status_id, to_status_id)
SELECT
  '398ab53e-3d10-5e17-a6c9-fd97fd68905f'::uuid,
  flow_id,
  'bef6e3cf-9b8c-5c2f-be00-a3f312ab048c'::uuid,
  'd891bd28-b61b-5135-9a87-241d99fa5594'::uuid
FROM flow_statuses
WHERE id = 'bef6e3cf-9b8c-5c2f-be00-a3f312ab048c'::uuid;

INSERT INTO flow_transitions (id, flow_id, from_status_id, to_status_id)
SELECT
  '615afba5-1228-5099-8922-bf9172b0f6d0'::uuid,
  flow_id,
  'bef6e3cf-9b8c-5c2f-be00-a3f312ab048c'::uuid,
  '894fa035-4c05-5af0-a537-bfe14546f0e3'::uuid
FROM flow_statuses
WHERE id = 'bef6e3cf-9b8c-5c2f-be00-a3f312ab048c'::uuid;

-- 4. Remove the now-obsolete closed → validate transition. With staging in
--    place, reopen paths are intentionally severed — prod regressions are
--    tracked as fresh BUG tasks rather than reopening a closed one (matches
--    the feature flow). validate → closed is intentionally retained as the
--    early-termination escape (wont_fix / duplicate / etc.).
DELETE FROM flow_transitions
WHERE id = '82f20b1d-cb2f-516b-a331-f5d8ebb1bb84'::uuid;
