import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { withDatabaseMetrics } from '@/lib/metrics';

export type FreeUsageBucket = {
  limit: number;
  used: number;
  remaining: number;
  exhausted: boolean;
};

export type FreeUsageStatus =
  | 'available'
  | 'user_exhausted'
  | 'global_exhausted'
  | 'disabled';

export type FreeUsageSnapshot = {
  provider: 'groq';
  model: string;
  user: FreeUsageBucket;
  global: FreeUsageBucket;
  status: FreeUsageStatus;
  resetAt: string;
};

export class FreeQuotaError extends Error {
  constructor(
    readonly code: 'free_user_limit_reached' | 'free_global_limit_reached',
    message: string
  ) {
    super(message);
  }
}

const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';
const DEFAULT_MODEL = 'moonshotai/kimi-k2-instruct-0905';
const DEFAULT_FALLBACK_MODELS = ['llama-3.1-8b-instant'];
const DEFAULT_USER_LIMIT = 50;
const DEFAULT_GLOBAL_LIMIT = 1000;
const MAX_RESERVATION_RETRIES = 4;

function parseLimit(raw: string | undefined, fallback: number) {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getQuotaDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function getResetAt(day: Date) {
  return new Date(day.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

function buildBucket(limit: number, used: number): FreeUsageBucket {
  const safeUsed = Math.max(0, used);
  return {
    limit,
    used: safeUsed,
    remaining: Math.max(0, limit - safeUsed),
    exhausted: safeUsed >= limit
  };
}

function buildStatus(
  model: string,
  userLimit: number,
  globalLimit: number,
  userUsed: number,
  globalUsed: number,
  configured = true
): FreeUsageSnapshot {
  const day = getQuotaDay();
  const user = buildBucket(userLimit, configured ? userUsed : userLimit);
  const global = buildBucket(globalLimit, configured ? globalUsed : globalLimit);

  let status: FreeUsageStatus = 'available';
  if (!configured) {
    status = 'disabled';
  } else if (global.exhausted) {
    status = 'global_exhausted';
  } else if (user.exhausted) {
    status = 'user_exhausted';
  }

  return {
    provider: 'groq',
    model,
    user,
    global,
    status,
    resetAt: getResetAt(day)
  };
}

type CountRow = {
  count: number;
};

export function getFreeTierConfig() {
  const fallbackModels = (process.env.GROQ_FREE_FALLBACK_MODELS ?? DEFAULT_FALLBACK_MODELS.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    apiKey: process.env.GROQ_API_KEY?.trim() ?? '',
    baseUrl: (process.env.GROQ_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, ''),
    model: process.env.GROQ_FREE_MODEL?.trim() || DEFAULT_MODEL,
    fallbackModels,
    userLimit: parseLimit(process.env.FREE_USER_DAILY_LIMIT, DEFAULT_USER_LIMIT),
    globalLimit: parseLimit(process.env.FREE_GLOBAL_DAILY_LIMIT, DEFAULT_GLOBAL_LIMIT)
  };
}

export function isFreeTierConfigured() {
  const config = getFreeTierConfig();
  return Boolean(config.apiKey && config.model);
}

async function getUsageRows(userId: string, day: Date) {
  const [userUsage, globalUsage] = await withDatabaseMetrics('free_usage.read', () =>
    Promise.all([
      prisma.$queryRaw<CountRow[]>`
        SELECT "count"
        FROM "UserDailyFreeUsage"
        WHERE "userId" = ${userId} AND "day" = ${day}
        LIMIT 1
      `,
      prisma.$queryRaw<CountRow[]>`
        SELECT "count"
        FROM "GlobalDailyFreeUsage"
        WHERE "day" = ${day}
        LIMIT 1
      `
    ])
  );

  return {
    userCount: userUsage[0]?.count ?? 0,
    globalCount: globalUsage[0]?.count ?? 0
  };
}

export async function getFreeUsageStatus(userId: string): Promise<FreeUsageSnapshot> {
  const config = getFreeTierConfig();
  const day = getQuotaDay();

  if (!isFreeTierConfigured()) {
    return buildStatus(config.model, config.userLimit, config.globalLimit, 0, 0, false);
  }

  const { userCount, globalCount } = await getUsageRows(userId, day);
  return buildStatus(config.model, config.userLimit, config.globalLimit, userCount, globalCount);
}

function isRetryableReservationError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (((error as { code?: string }).code === 'P2034') || ((error as { code?: string }).code === 'P2002'))
  );
}

export async function reserveFreeRequest(userId: string): Promise<FreeUsageSnapshot> {
  const config = getFreeTierConfig();
  if (!isFreeTierConfigured()) {
    throw new Error('KeyLM free mode is not configured.');
  }

  const day = getQuotaDay();
  const usageId = crypto.randomUUID();

  for (let attempt = 0; attempt < MAX_RESERVATION_RETRIES; attempt += 1) {
    try {
      return await withDatabaseMetrics('free_usage.reserve', () =>
        prisma.$transaction(
          async (tx) => {
            await tx.$executeRaw`
              INSERT INTO "GlobalDailyFreeUsage" ("day", "count", "createdAt", "updatedAt")
              VALUES (${day}, 0, NOW(), NOW())
              ON CONFLICT ("day") DO NOTHING
            `;
            await tx.$executeRaw`
              INSERT INTO "UserDailyFreeUsage" ("id", "userId", "day", "count", "createdAt", "updatedAt")
              VALUES (${usageId}, ${userId}, ${day}, 0, NOW(), NOW())
              ON CONFLICT ("userId", "day") DO NOTHING
            `;

            const [globalUsage] = await tx.$queryRaw<CountRow[]>`
              SELECT "count"
              FROM "GlobalDailyFreeUsage"
              WHERE "day" = ${day}
              FOR UPDATE
            `;
            if ((globalUsage?.count ?? 0) >= config.globalLimit) {
              throw new FreeQuotaError(
                'free_global_limit_reached',
                'No global free API requests are left today. Connect your own API key to continue.'
              );
            }

            const [userUsage] = await tx.$queryRaw<CountRow[]>`
              SELECT "count"
              FROM "UserDailyFreeUsage"
              WHERE "userId" = ${userId} AND "day" = ${day}
              FOR UPDATE
            `;
            if ((userUsage?.count ?? 0) >= config.userLimit) {
              throw new FreeQuotaError(
                'free_user_limit_reached',
                'Your free daily request limit is over. Connect your own API key to continue chatting.'
              );
            }

            const [nextGlobal] = await tx.$queryRaw<CountRow[]>`
              UPDATE "GlobalDailyFreeUsage"
              SET "count" = "count" + 1, "updatedAt" = NOW()
              WHERE "day" = ${day}
              RETURNING "count"
            `;
            const [nextUser] = await tx.$queryRaw<CountRow[]>`
              UPDATE "UserDailyFreeUsage"
              SET "count" = "count" + 1, "updatedAt" = NOW()
              WHERE "userId" = ${userId} AND "day" = ${day}
              RETURNING "count"
            `;

            return buildStatus(
              config.model,
              config.userLimit,
              config.globalLimit,
              nextUser?.count ?? 0,
              nextGlobal?.count ?? 0
            );
          },
          {
            isolationLevel: 'Serializable'
          }
        )
      );
    } catch (error) {
      if (error instanceof FreeQuotaError) {
        throw error;
      }

      if (isRetryableReservationError(error) && attempt < MAX_RESERVATION_RETRIES - 1) {
        continue;
      }

      throw error;
    }
  }

  throw new Error('Failed to reserve free usage.');
}

export async function releaseFreeRequest(userId: string): Promise<FreeUsageSnapshot> {
  const config = getFreeTierConfig();
  if (!isFreeTierConfigured()) {
    throw new Error('KeyLM free mode is not configured.');
  }

  const day = getQuotaDay();

  return withDatabaseMetrics('free_usage.release', () =>
    prisma.$transaction(
      async (tx) => {
        const [nextGlobal] = await tx.$queryRaw<CountRow[]>`
          UPDATE "GlobalDailyFreeUsage"
          SET "count" = GREATEST("count" - 1, 0), "updatedAt" = NOW()
          WHERE "day" = ${day}
          RETURNING "count"
        `;
        const [nextUser] = await tx.$queryRaw<CountRow[]>`
          UPDATE "UserDailyFreeUsage"
          SET "count" = GREATEST("count" - 1, 0), "updatedAt" = NOW()
          WHERE "userId" = ${userId} AND "day" = ${day}
          RETURNING "count"
        `;

        return buildStatus(
          config.model,
          config.userLimit,
          config.globalLimit,
          nextUser?.count ?? 0,
          nextGlobal?.count ?? 0
        );
      },
      {
        isolationLevel: 'Serializable'
      }
    )
  );
}
