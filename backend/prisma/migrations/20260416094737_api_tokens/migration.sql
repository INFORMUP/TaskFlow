-- CreateTable
CREATE TABLE "api_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMPTZ,

    CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scopes" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_token_scopes" (
    "token_id" UUID NOT NULL,
    "scope_id" UUID NOT NULL,

    CONSTRAINT "api_token_scopes_pkey" PRIMARY KEY ("token_id","scope_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "api_tokens_token_hash_key" ON "api_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "api_tokens_user_id_idx" ON "api_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "scopes_key_key" ON "scopes"("key");

-- CreateIndex
CREATE INDEX "api_token_scopes_scope_id_idx" ON "api_token_scopes"("scope_id");

-- AddForeignKey
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_token_scopes" ADD CONSTRAINT "api_token_scopes_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "api_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_token_scopes" ADD CONSTRAINT "api_token_scopes_scope_id_fkey" FOREIGN KEY ("scope_id") REFERENCES "scopes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
