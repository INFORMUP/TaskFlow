-- Self-referential many-to-many: Task A is blocked by Task B.
CREATE TABLE "task_dependencies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "blocking_task_id" UUID NOT NULL,
  "blocked_task_id" UUID NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_dependencies_no_self" CHECK ("blocking_task_id" <> "blocked_task_id")
);

CREATE UNIQUE INDEX "task_dependencies_pair_key"
  ON "task_dependencies"("blocking_task_id", "blocked_task_id");

CREATE INDEX "task_dependencies_blocked_task_id_idx"
  ON "task_dependencies"("blocked_task_id");

CREATE INDEX "task_dependencies_blocking_task_id_idx"
  ON "task_dependencies"("blocking_task_id");

ALTER TABLE "task_dependencies"
  ADD CONSTRAINT "task_dependencies_blocking_task_id_fkey"
  FOREIGN KEY ("blocking_task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_dependencies"
  ADD CONSTRAINT "task_dependencies_blocked_task_id_fkey"
  FOREIGN KEY ("blocked_task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "task_dependencies"
  ADD CONSTRAINT "task_dependencies_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
