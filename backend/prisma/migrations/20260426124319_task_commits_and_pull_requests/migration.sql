-- CreateTable
CREATE TABLE "task_commits" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "repository_id" UUID NOT NULL,
    "sha" TEXT NOT NULL,
    "message" TEXT,
    "author" TEXT,
    "authored_at" TIMESTAMPTZ,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_commits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_pull_requests" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "repository_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT,
    "state" TEXT NOT NULL,
    "author" TEXT,
    "merged_at" TIMESTAMPTZ,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_pull_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_commits_task_id_idx" ON "task_commits"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_commits_repository_id_sha_key" ON "task_commits"("repository_id", "sha");

-- CreateIndex
CREATE INDEX "task_pull_requests_task_id_idx" ON "task_pull_requests"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "task_pull_requests_repository_id_number_key" ON "task_pull_requests"("repository_id", "number");

-- AddForeignKey
ALTER TABLE "task_commits" ADD CONSTRAINT "task_commits_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_commits" ADD CONSTRAINT "task_commits_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "project_repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_pull_requests" ADD CONSTRAINT "task_pull_requests_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_pull_requests" ADD CONSTRAINT "task_pull_requests_repository_id_fkey" FOREIGN KEY ("repository_id") REFERENCES "project_repositories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
