-- Rename the feature flow's status slug `review` → `staging`.
-- The seeders compute deterministic IDs via uuid5 keyed on the slug, so renaming
-- the slug also requires renaming the row IDs (and the dependent flow_transition
-- IDs) so a fresh seeder run finds the existing rows and skips them, instead of
-- trying to insert new rows that would collide on the (flow_id, slug) /
-- (flow_id, from_status_id, to_status_id) unique constraints.
--
-- IDs below are the precomputed uuid5(`taskflow:seed:<entity>:<key>`, uuid5.URL)
-- values for the old and new keys. See backend/prisma/seeders/common.ts.

-- 1. Insert the renamed FlowStatus row alongside the old one (briefly both
--    exist so we can repoint FK references).
INSERT INTO flow_statuses (id, flow_id, slug, name, description, sort_order, color, created_at)
SELECT
  '2ebf5073-5756-5438-bcd0-3d32550518a1'::uuid,
  flow_id,
  'staging',
  name,
  'Feature is staged for release',
  sort_order,
  color,
  created_at
FROM flow_statuses
WHERE id = '03cd0622-f279-57e8-99ab-786f01f353ef'::uuid;

-- 2. Repoint every FK that referenced the old status row.
UPDATE tasks
SET current_status_id = '2ebf5073-5756-5438-bcd0-3d32550518a1'::uuid
WHERE current_status_id = '03cd0622-f279-57e8-99ab-786f01f353ef'::uuid;

UPDATE task_transitions
SET from_status_id = '2ebf5073-5756-5438-bcd0-3d32550518a1'::uuid
WHERE from_status_id = '03cd0622-f279-57e8-99ab-786f01f353ef'::uuid;

UPDATE task_transitions
SET to_status_id = '2ebf5073-5756-5438-bcd0-3d32550518a1'::uuid
WHERE to_status_id = '03cd0622-f279-57e8-99ab-786f01f353ef'::uuid;

UPDATE flow_transitions
SET from_status_id = '2ebf5073-5756-5438-bcd0-3d32550518a1'::uuid
WHERE from_status_id = '03cd0622-f279-57e8-99ab-786f01f353ef'::uuid;

UPDATE flow_transitions
SET to_status_id = '2ebf5073-5756-5438-bcd0-3d32550518a1'::uuid
WHERE to_status_id = '03cd0622-f279-57e8-99ab-786f01f353ef'::uuid;

UPDATE project_status_default_assignees
SET flow_status_id = '2ebf5073-5756-5438-bcd0-3d32550518a1'::uuid
WHERE flow_status_id = '03cd0622-f279-57e8-99ab-786f01f353ef'::uuid;

-- 3. Drop the old FlowStatus row.
DELETE FROM flow_statuses
WHERE id = '03cd0622-f279-57e8-99ab-786f01f353ef'::uuid;

-- 4. Rename the IDs of the three FlowTransition rows whose seedUuid keys
--    embed the `review` slug, so the seeder skips them on next run.
UPDATE flow_transitions
SET id = '52c55d08-fd7c-5e3c-92d8-713c3632a88c'::uuid
WHERE id = 'ac6d961c-6d7f-5b91-90a6-6d6c51ddc27c'::uuid;

UPDATE flow_transitions
SET id = '4f8aff75-22b0-57d6-974e-dddcec0dffea'::uuid
WHERE id = '71f53648-916e-51c9-ac82-6d87f006fde3'::uuid;

UPDATE flow_transitions
SET id = '706d64a8-6317-5c4a-9675-786b7fe0ef2c'::uuid
WHERE id = '581b3f28-55c0-5192-aef7-2a166ca95d2a'::uuid;
