-- CreateTable: task_images join table
CREATE TABLE "task_images" (
  "task_id"  UUID NOT NULL,
  "image_id" UUID NOT NULL,
  CONSTRAINT "task_images_pkey" PRIMARY KEY ("task_id", "image_id")
);

-- CreateTable: comment_images join table
CREATE TABLE "comment_images" (
  "comment_id" UUID NOT NULL,
  "image_id"   UUID NOT NULL,
  CONSTRAINT "comment_images_pkey" PRIMARY KEY ("comment_id", "image_id")
);

-- CreateTable: requirement_images join table
CREATE TABLE "requirement_images" (
  "requirement_id" UUID NOT NULL,
  "image_id"       UUID NOT NULL,
  CONSTRAINT "requirement_images_pkey" PRIMARY KEY ("requirement_id", "image_id")
);

-- Migrate existing FK data into join tables
INSERT INTO "requirement_images" ("requirement_id", "image_id")
  SELECT "requirement_id", "id" FROM "images" WHERE "requirement_id" IS NOT NULL;

INSERT INTO "task_images" ("task_id", "image_id")
  SELECT "task_id", "id" FROM "images" WHERE "task_id" IS NOT NULL;

INSERT INTO "comment_images" ("comment_id", "image_id")
  SELECT "comment_id", "id" FROM "images" WHERE "comment_id" IS NOT NULL;

-- AddForeignKey: task_images → tasks
ALTER TABLE "task_images"
  ADD CONSTRAINT "task_images_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: task_images → images
ALTER TABLE "task_images"
  ADD CONSTRAINT "task_images_image_id_fkey"
  FOREIGN KEY ("image_id") REFERENCES "images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: comment_images → comments
ALTER TABLE "comment_images"
  ADD CONSTRAINT "comment_images_comment_id_fkey"
  FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: comment_images → images
ALTER TABLE "comment_images"
  ADD CONSTRAINT "comment_images_image_id_fkey"
  FOREIGN KEY ("image_id") REFERENCES "images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: requirement_images → requirements
ALTER TABLE "requirement_images"
  ADD CONSTRAINT "requirement_images_requirement_id_fkey"
  FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: requirement_images → images
ALTER TABLE "requirement_images"
  ADD CONSTRAINT "requirement_images_image_id_fkey"
  FOREIGN KEY ("image_id") REFERENCES "images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop old FK constraints from images
ALTER TABLE "images" DROP CONSTRAINT IF EXISTS "images_requirement_id_fkey";
ALTER TABLE "images" DROP CONSTRAINT IF EXISTS "images_task_id_fkey";
ALTER TABLE "images" DROP CONSTRAINT IF EXISTS "images_comment_id_fkey";

-- Drop old indexes
DROP INDEX IF EXISTS "images_requirement_id_idx";
DROP INDEX IF EXISTS "images_task_id_idx";
DROP INDEX IF EXISTS "images_comment_id_idx";

-- Drop FK columns from images
ALTER TABLE "images"
  DROP COLUMN IF EXISTS "requirement_id",
  DROP COLUMN IF EXISTS "task_id",
  DROP COLUMN IF EXISTS "comment_id";
