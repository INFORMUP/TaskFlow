-- DropIndex
DROP INDEX "flows_slug_key";

-- CreateTable
CREATE TABLE "project_flows" (
    "project_id" UUID NOT NULL,
    "flow_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_flows_pkey" PRIMARY KEY ("project_id","flow_id")
);

-- CreateIndex
CREATE INDEX "project_flows_flow_id_idx" ON "project_flows"("flow_id");

-- CreateIndex
CREATE INDEX "flows_slug_idx" ON "flows"("slug");

-- AddForeignKey
ALTER TABLE "project_flows" ADD CONSTRAINT "project_flows_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_flows" ADD CONSTRAINT "project_flows_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "flows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every flow currently used by a project's tasks must be attached
-- to that project so existing tasks remain reachable under the new union rule.
INSERT INTO "project_flows" ("project_id", "flow_id", "created_at")
SELECT DISTINCT tp."project_id", t."flow_id", NOW()
FROM "task_projects" tp
JOIN "tasks" t ON t."id" = tp."task_id"
ON CONFLICT DO NOTHING;

-- Also attach each project's default_flow_id so PATCH default_flow_id validation
-- doesn't trip the "default must be attached" rule on already-set defaults.
INSERT INTO "project_flows" ("project_id", "flow_id", "created_at")
SELECT "id", "default_flow_id", NOW()
FROM "projects"
WHERE "default_flow_id" IS NOT NULL
ON CONFLICT DO NOTHING;
