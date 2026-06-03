-- CreateTable
CREATE TABLE "signoff_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "project_id" UUID,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "signoff_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signoff_policy_slots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "policy_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "required_actor_type" TEXT,
    "required_user_id" UUID,

    CONSTRAINT "signoff_policy_slots_pkey" PRIMARY KEY ("id")
);

-- AddColumn defaultSignoffPolicyId to app_settings
ALTER TABLE "app_settings" ADD COLUMN "default_signoff_policy_id" UUID;

-- AddColumn defaultSignoffPolicyId to projects
ALTER TABLE "projects" ADD COLUMN "default_signoff_policy_id" UUID;

-- AddColumn defaultSignoffPolicyId to tasks
ALTER TABLE "tasks" ADD COLUMN "default_signoff_policy_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "signoff_policies_org_id_slug_key" ON "signoff_policies"("org_id", "slug");
CREATE INDEX "signoff_policies_org_id_idx" ON "signoff_policies"("org_id");
CREATE INDEX "signoff_policies_project_id_idx" ON "signoff_policies"("project_id");
CREATE INDEX "signoff_policy_slots_policy_id_idx" ON "signoff_policy_slots"("policy_id");
CREATE INDEX "projects_default_signoff_policy_id_idx" ON "projects"("default_signoff_policy_id");
CREATE INDEX "tasks_default_signoff_policy_id_idx" ON "tasks"("default_signoff_policy_id");

-- AddForeignKey
ALTER TABLE "signoff_policies" ADD CONSTRAINT "signoff_policies_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "signoff_policy_slots" ADD CONSTRAINT "signoff_policy_slots_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "signoff_policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "signoff_policy_slots" ADD CONSTRAINT "signoff_policy_slots_required_user_id_fkey" FOREIGN KEY ("required_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_default_signoff_policy_id_fkey" FOREIGN KEY ("default_signoff_policy_id") REFERENCES "signoff_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "projects" ADD CONSTRAINT "projects_default_signoff_policy_id_fkey" FOREIGN KEY ("default_signoff_policy_id") REFERENCES "signoff_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_default_signoff_policy_id_fkey" FOREIGN KEY ("default_signoff_policy_id") REFERENCES "signoff_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
