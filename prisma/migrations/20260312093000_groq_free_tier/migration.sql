-- Create the replacement enum without the deprecated openrouter value.
CREATE TYPE "Provider_new" AS ENUM ('openai', 'gemini', 'anthropic', 'groq');

ALTER TABLE "ProviderKey"
ALTER COLUMN "provider" TYPE "Provider_new"
USING (
  CASE
    WHEN "provider"::text = 'openrouter' THEN 'groq'
    ELSE "provider"::text
  END
)::"Provider_new";

ALTER TABLE "ProviderModelCache"
ALTER COLUMN "provider" TYPE "Provider_new"
USING (
  CASE
    WHEN "provider"::text = 'openrouter' THEN 'groq'
    ELSE "provider"::text
  END
)::"Provider_new";

ALTER TABLE "Thread"
ALTER COLUMN "provider" TYPE "Provider_new"
USING (
  CASE
    WHEN "provider"::text = 'openrouter' THEN 'groq'
    ELSE "provider"::text
  END
)::"Provider_new";

ALTER TABLE "AuditLog"
ALTER COLUMN "provider" TYPE "Provider_new"
USING (
  CASE
    WHEN "provider"::text = 'openrouter' THEN 'groq'
    ELSE "provider"::text
  END
)::"Provider_new";

UPDATE "Thread"
SET
  "model" = 'moonshotai/kimi-k2-instruct-0905',
  "settings" = jsonb_set(COALESCE("settings"::jsonb, '{}'::jsonb), '{runtimeSource}', '"groq"', true)
WHERE COALESCE("settings"::jsonb ->> 'runtimeSource', '') IN ('openrouter', 'groq');

DROP TYPE "Provider";

ALTER TYPE "Provider_new" RENAME TO "Provider";
