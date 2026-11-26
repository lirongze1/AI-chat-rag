-- Enterprise admin upgrade: phone accounts, roles, soft-delete flag and runtime config.
-- Incremental only: no historical table or column is dropped.

-- UserRole enum used by app_users.role
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- app_users: phone login, role based access control, soft deletion.
-- email becomes nullable to keep legacy rows valid.
ALTER TABLE "app_users" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "app_users" ADD COLUMN "phone" TEXT;
ALTER TABLE "app_users" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';
ALTER TABLE "app_users" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

-- Unique index for phone login (NULLs are allowed and do not conflict).
CREATE UNIQUE INDEX "app_users_phone_key" ON "app_users"("phone");

-- Runtime configuration store. API keys are stored encrypted at application level.
CREATE TABLE "app_configs" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "data" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,
    CONSTRAINT "app_configs_pkey" PRIMARY KEY ("id")
);
