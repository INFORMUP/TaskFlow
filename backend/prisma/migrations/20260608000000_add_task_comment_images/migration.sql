-- AlterTable
ALTER TABLE "images" ADD COLUMN "task_id" UUID,
                     ADD COLUMN "comment_id" UUID;

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_comment_id_fkey"
  FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "images_task_id_idx" ON "images"("task_id");

-- CreateIndex
CREATE INDEX "images_comment_id_idx" ON "images"("comment_id");
