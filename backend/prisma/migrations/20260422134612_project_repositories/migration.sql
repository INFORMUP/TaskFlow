-- CreateEnum
CREATE TYPE "repo_provider" AS ENUM ('GITHUB');

-- CreateTable
CREATE TABLE "project_repositories" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "provider" "repo_provider" NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_repositories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_repositories_project_id_idx" ON "project_repositories"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_repositories_project_id_provider_owner_name_key" ON "project_repositories"("project_id", "provider", "owner", "name");

-- AddForeignKey
ALTER TABLE "project_repositories" ADD CONSTRAINT "project_repositories_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
