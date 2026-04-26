-- Backfill legacy ENHANCEMENT values to FEATURE so existing rows align with the
-- new BUG / FEATURE / IMPROVEMENT taxonomy.
UPDATE "feedback" SET "type" = 'FEATURE' WHERE "type" = 'ENHANCEMENT';

-- Add nullable task_id linking feedback to an auto-created task. SetNull on
-- task delete so feedback survives if the task is removed.
ALTER TABLE "feedback" ADD COLUMN "task_id" UUID;

CREATE UNIQUE INDEX "feedback_task_id_key" ON "feedback"("task_id");

ALTER TABLE "feedback" ADD CONSTRAINT "feedback_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "tasks"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
