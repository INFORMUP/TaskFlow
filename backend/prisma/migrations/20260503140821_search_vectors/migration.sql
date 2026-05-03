-- Adds Postgres full-text search vectors and GIN indexes for global search.
-- Tasks index title + description; projects index name + key.

ALTER TABLE "tasks"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) STORED;

CREATE INDEX "tasks_search_vector_idx" ON "tasks" USING GIN ("search_vector");

ALTER TABLE "projects"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(key, ''))
  ) STORED;

CREATE INDEX "projects_search_vector_idx" ON "projects" USING GIN ("search_vector");
