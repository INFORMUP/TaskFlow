-- AlterTable
ALTER TABLE "task_projects" ADD COLUMN     "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "project_status_default_assignees" (
    "project_id" UUID NOT NULL,
    "flow_status_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,

    CONSTRAINT "project_status_default_assignees_pkey" PRIMARY KEY ("project_id","flow_status_id")
);

-- CreateIndex
CREATE INDEX "project_status_default_assignees_flow_status_id_idx" ON "project_status_default_assignees"("flow_status_id");

-- CreateIndex
CREATE INDEX "project_status_default_assignees_user_id_idx" ON "project_status_default_assignees"("user_id");

-- AddForeignKey
ALTER TABLE "project_status_default_assignees" ADD CONSTRAINT "project_status_default_assignees_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_status_default_assignees" ADD CONSTRAINT "project_status_default_assignees_flow_status_id_fkey" FOREIGN KEY ("flow_status_id") REFERENCES "flow_statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_status_default_assignees" ADD CONSTRAINT "project_status_default_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
