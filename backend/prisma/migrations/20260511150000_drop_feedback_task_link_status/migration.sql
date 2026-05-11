-- Drop the task-link status surface from feedback. Admin triage (explicit
-- promote-to-task button) replaces the auto-link path, so the status state
-- machine and its index are no longer meaningful.

DROP INDEX IF EXISTS "feedback_task_link_status_idx";

ALTER TABLE "feedback"
  DROP COLUMN IF EXISTS "task_link_status",
  DROP COLUMN IF EXISTS "task_link_error";
