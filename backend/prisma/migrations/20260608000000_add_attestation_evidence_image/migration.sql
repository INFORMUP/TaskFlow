-- AlterTable
ALTER TABLE "attestations" ADD COLUMN "evidence_image_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "attestations_evidence_image_id_key" ON "attestations"("evidence_image_id");

-- AddForeignKey
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_evidence_image_id_fkey"
    FOREIGN KEY ("evidence_image_id") REFERENCES "images"("id") ON DELETE SET NULL ON UPDATE CASCADE;
