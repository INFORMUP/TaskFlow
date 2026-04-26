-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "token_hash" TEXT,
    "invited_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "accepted_at" TIMESTAMPTZ,
    "accepted_by_user_id" UUID,
    "revoked_at" TIMESTAMPTZ,
    "revoked_by_id" UUID,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_org_id_email_idx" ON "invitations"("org_id", "email");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- Partial unique index: only one pending (not-accepted, not-revoked) invitation
-- per (org, email) at a time. Prisma can't model partial uniques, so raw SQL.
CREATE UNIQUE INDEX "invitations_org_email_pending_unique"
    ON "invitations"("org_id", "email")
    WHERE "accepted_at" IS NULL AND "revoked_at" IS NULL;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: for every OrgMember row whose user is still in status='invited',
-- create an Invitation row (expiring 7 days after the membership was created,
-- so old stale invites surface as "expired"), then remove the OrgMember row.
-- The placeholder user itself is flipped to 'deactivated' so it doesn't linger
-- as an implicit active member. A later Google OAuth sign-in will re-link by
-- email and the new auto-accept logic in auth.ts will create a real OrgMember.
INSERT INTO "invitations" ("id", "org_id", "email", "role", "created_at", "expires_at")
SELECT
    gen_random_uuid(),
    om."org_id",
    u."email",
    om."role",
    om."created_at",
    om."created_at" + INTERVAL '7 days'
FROM "org_members" om
JOIN "users" u ON u."id" = om."user_id"
WHERE u."status" = 'invited' AND u."email" IS NOT NULL;

DELETE FROM "org_members"
WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "status" = 'invited');

UPDATE "users" SET "status" = 'deactivated' WHERE "status" = 'invited';
