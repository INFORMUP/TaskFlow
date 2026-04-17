-- Default organization UUID (uuid5 of "taskflow:seed:organization:default" under uuid5.URL)
-- Kept in sync with backend/prisma/seeders/organizations.ts.

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateTable
CREATE TABLE "org_members" (
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_members_pkey" PRIMARY KEY ("org_id","user_id")
);

-- CreateIndex
CREATE INDEX "org_members_user_id_idx" ON "org_members"("user_id");

-- AddForeignKey
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Insert the deterministic default organization so backfills have a target.
INSERT INTO "organizations" ("id", "slug", "name")
VALUES ('2ee0765c-6028-54a4-a201-a639ff748972'::uuid, 'default', 'Default')
ON CONFLICT ("id") DO NOTHING;

-- teams: add org_id, backfill, enforce NOT NULL + FK, swap unique indexes.
ALTER TABLE "teams" ADD COLUMN "org_id" UUID;
UPDATE "teams" SET "org_id" = '2ee0765c-6028-54a4-a201-a639ff748972'::uuid WHERE "org_id" IS NULL;
ALTER TABLE "teams" ALTER COLUMN "org_id" SET NOT NULL;
ALTER TABLE "teams" ADD CONSTRAINT "teams_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX IF EXISTS "teams_name_key";
DROP INDEX IF EXISTS "teams_slug_key";
CREATE UNIQUE INDEX "teams_org_id_slug_key" ON "teams"("org_id", "slug");
CREATE UNIQUE INDEX "teams_org_id_name_key" ON "teams"("org_id", "name");

-- projects: add org_id, backfill, enforce NOT NULL + FK, swap unique.
ALTER TABLE "projects" ADD COLUMN "org_id" UUID;
UPDATE "projects" SET "org_id" = '2ee0765c-6028-54a4-a201-a639ff748972'::uuid WHERE "org_id" IS NULL;
ALTER TABLE "projects" ALTER COLUMN "org_id" SET NOT NULL;
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX IF EXISTS "projects_key_key";
CREATE UNIQUE INDEX "projects_org_id_key_key" ON "projects"("org_id", "key");

-- flows: add org_id, backfill, enforce NOT NULL + FK, swap index.
ALTER TABLE "flows" ADD COLUMN "org_id" UUID;
UPDATE "flows" SET "org_id" = '2ee0765c-6028-54a4-a201-a639ff748972'::uuid WHERE "org_id" IS NULL;
ALTER TABLE "flows" ALTER COLUMN "org_id" SET NOT NULL;
ALTER TABLE "flows" ADD CONSTRAINT "flows_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX IF EXISTS "flows_slug_idx";
CREATE INDEX "flows_org_id_slug_idx" ON "flows"("org_id", "slug");

-- api_tokens: add org_id, backfill, enforce NOT NULL + FK, add org index.
ALTER TABLE "api_tokens" ADD COLUMN "org_id" UUID;
UPDATE "api_tokens" SET "org_id" = '2ee0765c-6028-54a4-a201-a639ff748972'::uuid WHERE "org_id" IS NULL;
ALTER TABLE "api_tokens" ALTER COLUMN "org_id" SET NOT NULL;
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "api_tokens_org_id_idx" ON "api_tokens"("org_id");

-- app_settings: convert the singleton row into a per-org row keyed by org_id.
ALTER TABLE "app_settings" ADD COLUMN "org_id" UUID;
UPDATE "app_settings" SET "org_id" = '2ee0765c-6028-54a4-a201-a639ff748972'::uuid WHERE "id" = 'singleton';
-- Any rows that survived without the 'singleton' id also get mapped to default.
UPDATE "app_settings" SET "org_id" = '2ee0765c-6028-54a4-a201-a639ff748972'::uuid WHERE "org_id" IS NULL;
ALTER TABLE "app_settings" DROP CONSTRAINT "app_settings_pkey";
ALTER TABLE "app_settings" DROP COLUMN "id";
ALTER TABLE "app_settings" ALTER COLUMN "org_id" SET NOT NULL;
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_pkey" PRIMARY KEY ("org_id");
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill org_members from distinct users reachable via user_teams.
INSERT INTO "org_members" ("org_id", "user_id", "role")
SELECT DISTINCT '2ee0765c-6028-54a4-a201-a639ff748972'::uuid, ut."user_id", 'member'
FROM "user_teams" ut
ON CONFLICT ("org_id", "user_id") DO NOTHING;

-- Promote the seed admin (Max) to owner if they already exist in users.
INSERT INTO "org_members" ("org_id", "user_id", "role")
SELECT '2ee0765c-6028-54a4-a201-a639ff748972'::uuid, 'a4faad20-55aa-46e1-98c2-2bb8bb6647d8'::uuid, 'owner'
WHERE EXISTS (SELECT 1 FROM "users" WHERE "id" = 'a4faad20-55aa-46e1-98c2-2bb8bb6647d8'::uuid)
ON CONFLICT ("org_id", "user_id") DO UPDATE SET "role" = 'owner';
