-- DropIndex
DROP INDEX "requirements_task_id_ordinal_key";

-- AlterTable
ALTER TABLE "requirements" ADD COLUMN     "parent_id" UUID;

-- CreateIndex
CREATE INDEX "requirements_task_id_parent_id_idx" ON "requirements"("task_id", "parent_id");

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
