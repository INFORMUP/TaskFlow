-- AlterTable
ALTER TABLE "task_transitions" ADD COLUMN     "new_assignee_id" UUID;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "due_date" DATE;

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "default_assignee_user_id" UUID,
    "default_flow_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_teams" (
    "project_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,

    CONSTRAINT "project_teams_pkey" PRIMARY KEY ("project_id","team_id")
);

-- CreateTable
CREATE TABLE "task_projects" (
    "task_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,

    CONSTRAINT "task_projects_pkey" PRIMARY KEY ("task_id","project_id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "default_flow_id" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "projects_key_key" ON "projects"("key");

-- CreateIndex
CREATE INDEX "projects_owner_user_id_idx" ON "projects"("owner_user_id");

-- CreateIndex
CREATE INDEX "projects_archived_at_idx" ON "projects"("archived_at");

-- CreateIndex
CREATE INDEX "project_teams_team_id_idx" ON "project_teams"("team_id");

-- CreateIndex
CREATE INDEX "task_projects_project_id_idx" ON "task_projects"("project_id");

-- CreateIndex
CREATE INDEX "tasks_due_date_idx" ON "tasks"("due_date");

-- AddForeignKey
ALTER TABLE "task_transitions" ADD CONSTRAINT "task_transitions_new_assignee_id_fkey" FOREIGN KEY ("new_assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_default_assignee_user_id_fkey" FOREIGN KEY ("default_assignee_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_default_flow_id_fkey" FOREIGN KEY ("default_flow_id") REFERENCES "flows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_teams" ADD CONSTRAINT "project_teams_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_teams" ADD CONSTRAINT "project_teams_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_projects" ADD CONSTRAINT "task_projects_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_projects" ADD CONSTRAINT "task_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_default_flow_id_fkey" FOREIGN KEY ("default_flow_id") REFERENCES "flows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
