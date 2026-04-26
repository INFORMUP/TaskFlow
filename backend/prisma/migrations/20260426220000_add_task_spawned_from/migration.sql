-- Add nullable self-referential FK for follow-up provenance.
ALTER TABLE "tasks" ADD COLUMN "spawned_from_task_id" UUID;

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_spawned_from_task_id_fkey"
  FOREIGN KEY ("spawned_from_task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "tasks_spawned_from_task_id_idx" ON "tasks"("spawned_from_task_id");
