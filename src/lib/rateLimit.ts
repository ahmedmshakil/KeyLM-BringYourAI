import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { supportsRateLimitBucket } from '@/lib/dbCompat';

const DEFAULT_LIMIT = Number.parseInt(process.env.RATE_LIMIT_PER_MINUTE || '60', 10);
const REFILL_INTERVAL_MS = 60_000;
const CLEANUP_PROBABILITY = 0.01;

type FallbackBucket = {
  tokens: number;
  lastRefill: number;
};

const fallbackBuckets = new Map<string, FallbackBucket>();

type RateLimitRow = {
  count: number;
  expiresAt: Date;
};

function getBucketKey(key: string) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function takeTokenInMemory(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = fallbackBuckets.get(key) ?? { tokens: limit, lastRefill: now };
  const elapsed = now - bucket.lastRefill;
  if (elapsed >= windowMs) {
    bucket.tokens = limit;
    bucket.lastRefill = now;
  }
  if (bucket.tokens <= 0) {
    fallbackBuckets.set(key, bucket);
    return false;
  }
  bucket.tokens -= 1;
  fallbackBuckets.set(key, bucket);
  return true;
}

function isMissingRateLimitTable(error: unknown) {
  return (
    error instanceof Error &&
    (error.message.includes('RateLimitBucket') || error.message.includes('relation "RateLimitBucket" does not exist'))
  );
}

function maybeCleanupExpiredBuckets(now: Date) {
  if (Math.random() >= CLEANUP_PROBABILITY) {
    return;
  }

  void prisma.rateLimitBucket
    .deleteMany({
      where: {
        expiresAt: {
          lte: now
        }
      }
    })
    .catch(() => undefined);
}

export async function takeToken(
  key: string,
  limit = DEFAULT_LIMIT,
  windowMs = REFILL_INTERVAL_MS
): Promise<boolean> {
  const safeLimit = Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_LIMIT;
  const safeWindowMs = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : REFILL_INTERVAL_MS;
  if (!(await supportsRateLimitBucket())) {
    return takeTokenInMemory(key, safeLimit, safeWindowMs);
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + safeWindowMs);

  maybeCleanupExpiredBuckets(now);

  try {
    const rows = await prisma.$queryRaw<RateLimitRow[]>`
      INSERT INTO "RateLimitBucket" ("key", "count", "expiresAt", "createdAt", "updatedAt")
      VALUES (${getBucketKey(key)}, 1, ${expiresAt}, ${now}, ${now})
      ON CONFLICT ("key") DO UPDATE
      SET
        "count" = CASE
          WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN 1
          ELSE "RateLimitBucket"."count" + 1
        END,
        "expiresAt" = CASE
          WHEN "RateLimitBucket"."expiresAt" <= ${now} THEN ${expiresAt}
          ELSE "RateLimitBucket"."expiresAt"
        END,
        "updatedAt" = ${now}
      RETURNING "count", "expiresAt"
    `;

    return (rows[0]?.count ?? safeLimit + 1) <= safeLimit;
  } catch (error) {
    if (isMissingRateLimitTable(error)) {
      return takeTokenInMemory(key, safeLimit, safeWindowMs);
    }

    throw error;
  }
}
