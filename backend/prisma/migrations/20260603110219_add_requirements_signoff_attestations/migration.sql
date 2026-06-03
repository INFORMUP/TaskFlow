-- CreateTable
CREATE TABLE "requirements" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "statement" TEXT NOT NULL,
    "rationale" TEXT,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signoff_slots" (
    "id" UUID NOT NULL,
    "requirement_id" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "required_actor_type" TEXT,
    "required_user_id" UUID,

    CONSTRAINT "signoff_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attestations" (
    "id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_type" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "evidence" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attestations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requirements_task_id_idx" ON "requirements"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "requirements_task_id_ordinal_key" ON "requirements"("task_id", "ordinal");

-- CreateIndex
CREATE INDEX "signoff_slots_requirement_id_idx" ON "signoff_slots"("requirement_id");

-- CreateIndex
CREATE INDEX "attestations_slot_id_idx" ON "attestations"("slot_id");

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signoff_slots" ADD CONSTRAINT "signoff_slots_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signoff_slots" ADD CONSTRAINT "signoff_slots_required_user_id_fkey" FOREIGN KEY ("required_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "signoff_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestations" ADD CONSTRAINT "attestations_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "task_dependencies_pair_key" RENAME TO "task_dependencies_blocking_task_id_blocked_task_id_key";
