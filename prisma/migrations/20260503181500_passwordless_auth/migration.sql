-- Make password hashes optional so Supabase passwordless users can exist locally.
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- Store the linked Supabase Auth user id and the latest successful passwordless login time.
ALTER TABLE "User" ADD COLUMN "supabaseUserId" TEXT;
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- Keep one local app user per Supabase Auth identity.
CREATE UNIQUE INDEX "User_supabaseUserId_key" ON "User"("supabaseUserId");