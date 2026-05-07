-- Add task-link status tracking to feedback so admins can see which submissions
-- were translated to tasks, which were skipped (and why), and which failed.

ALTER TABLE "feedback"
  ADD COLUMN "task_link_status" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "task_link_error" TEXT;

-- Backfill existing rows. Lossy by design (decided in discuss): rows with
-- task_id IS NULL are tagged skipped_no_config even if some may have actually
-- failed historically — we never recorded enough to know.
UPDATE "feedback"
  SET "task_link_status" = CASE
    WHEN "task_id" IS NOT NULL THEN 'linked'
    ELSE 'skipped_no_config'
  END;

CREATE INDEX "feedback_task_link_status_idx"
  ON "feedback" ("org_id", "task_link_status");
