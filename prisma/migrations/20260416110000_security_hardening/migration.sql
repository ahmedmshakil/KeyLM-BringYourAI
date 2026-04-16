-- AlterTable
ALTER TABLE "User"
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- Normalize duplicate-prone request IDs before enforcing uniqueness.
UPDATE "Message"
SET "clientRequestId" = NULL
WHERE "clientRequestId" IS NOT NULL AND BTRIM("clientRequestId") = '';

WITH ranked_messages AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (
            PARTITION BY "threadId", "clientRequestId", "role"
            ORDER BY "createdAt" ASC, "id" ASC
        ) AS "row_number"
    FROM "Message"
    WHERE "clientRequestId" IS NOT NULL
)
UPDATE "Message"
SET "clientRequestId" = NULL
FROM ranked_messages
WHERE "Message"."id" = ranked_messages."id"
  AND ranked_messages."row_number" > 1;

-- Preserve data integrity for previously-created free threads.
UPDATE "Thread"
SET "provider" = 'groq'::"Provider"
WHERE "provider" = 'openai'::"Provider"
  AND COALESCE("settings"::jsonb ->> 'runtimeSource', '') = 'groq';

-- CreateIndex
CREATE UNIQUE INDEX "Message_threadId_clientRequestId_role_key"
ON "Message"("threadId", "clientRequestId", "role");

-- CreateIndex
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");