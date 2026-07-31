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

export type SharedModelProvider = 'groq' | 'xiaomi';
export type SharedModelTier = 'free' | 'pro';

export type SharedModel = {
  id: string;
  displayName: string;
  provider: SharedModelProvider;
  tier: SharedModelTier;
  available: boolean;
};

type SharedModelDefinition = Omit<SharedModel, 'available'>;

export type FreeUsageSnapshot = {
  provider: 'groq';
  model: string;
  models: SharedModel[];
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
const DEFAULT_XIAOMI_BASE_URL = 'https://api.xiaomimimo.com/v1';
const SHARED_MODEL_DEFINITIONS: SharedModelDefinition[] = [
  {
    id: 'openai/gpt-oss-120b',
    displayName: 'GPT OSS 120B',
    provider: 'groq',
    tier: 'free'
  },
  {
    id: 'moonshotai/kimi-k2-instruct-0905',
    displayName: 'Kimi K2 Instruct',
    provider: 'groq',
    tier: 'free'
  },
  {
    id: 'groq/compound',
    displayName: 'Groq Compound',
    provider: 'groq',
    tier: 'free'
  },
  {
    id: 'qwen/qwen3-32b',
    displayName: 'Qwen3 32B',
    provider: 'groq',
    tier: 'free'
  },
  {
    id: 'mimo-v2.5',
    displayName: 'MiMo V2.5',
    provider: 'xiaomi',
    tier: 'pro'
  },
  {
    id: 'mimo-v2.5-pro',
    displayName: 'MiMo V2.5 Pro',
    provider: 'xiaomi',
    tier: 'pro'
  }
];
const DEFAULT_MODEL = SHARED_MODEL_DEFINITIONS[0].id;
const DEFAULT_FALLBACK_MODELS = ['llama-3.1-8b-instant'];
const DEFAULT_USER_LIMIT = 50;
const DEFAULT_GLOBAL_LIMIT = 100;
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
    models: getSharedModels(),
    user,
    global,
    status,
    resetAt: getResetAt(day)
  };
}

type CountRow = {
  count: number;
};

export function getSharedModels(): SharedModel[] {
  return SHARED_MODEL_DEFINITIONS.map((model) => ({
    ...model,
    available: isSharedModelConfigured(model)
  }));
}

export function getSharedModel(modelId: string): SharedModel | undefined {
  return getSharedModels().find((model) => model.id === modelId);
}

export function isValidSharedModel(model: string): boolean {
  return SHARED_MODEL_DEFINITIONS.some((entry) => entry.id === model);
}

export function getFreeTierConfig() {
  const fallbackModels = (process.env.GROQ_FREE_FALLBACK_MODELS ?? DEFAULT_FALLBACK_MODELS.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const requestedModel = process.env.GROQ_FREE_MODEL?.trim() || DEFAULT_MODEL;
  const model = SHARED_MODEL_DEFINITIONS.some(
    (entry) => entry.id === requestedModel && entry.provider === 'groq'
  )
    ? requestedModel
    : DEFAULT_MODEL;

  return {
    apiKey: process.env.GROQ_API_KEY?.trim() ?? '',
    baseUrl: (process.env.GROQ_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, ''),
    model,
    fallbackModels,
    userLimit: parseLimit(process.env.FREE_USER_DAILY_LIMIT, DEFAULT_USER_LIMIT),
    globalLimit: parseLimit(process.env.FREE_GLOBAL_DAILY_LIMIT, DEFAULT_GLOBAL_LIMIT)
  };
}

export function getXiaomiConfig() {
  return {
    apiKey: process.env.MIMO_API_KEY?.trim() ?? '',
    baseUrl: (process.env.MIMO_BASE_URL?.trim() || DEFAULT_XIAOMI_BASE_URL).replace(/\/$/, '')
  };
}

export function isFreeTierConfigured() {
  const config = getFreeTierConfig();
  return Boolean(config.apiKey);
}

export function isXiaomiConfigured() {
  return Boolean(getXiaomiConfig().apiKey);
}

export function isSharedModelConfigured(model: Pick<SharedModelDefinition, 'provider'>) {
  return model.provider === 'groq' ? isFreeTierConfigured() : isXiaomiConfigured();
}

export function isSharedCatalogConfigured() {
  return getSharedModels().some((model) => model.available);
}

export function getDefaultSharedModel() {
  const config = getFreeTierConfig();
  const configuredDefault = getSharedModel(config.model);
  if (configuredDefault?.provider === 'groq' && configuredDefault.available) {
    return configuredDefault.id;
  }

  return getSharedModels().find((model) => model.available)?.id ?? config.model;
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

  if (!isSharedCatalogConfigured()) {
    return buildStatus(getDefaultSharedModel(), config.userLimit, config.globalLimit, 0, 0, false);
  }

  const { userCount, globalCount } = await getUsageRows(userId, day);
  return buildStatus(getDefaultSharedModel(), config.userLimit, config.globalLimit, userCount, globalCount);
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
  if (!isSharedCatalogConfigured()) {
    throw new Error('KeyLM shared catalog is not configured.');
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

            // Atomic conditional increments — no SELECT FOR UPDATE lock waterfall.
            // Check user quota first (cheaper failure path for a single user).
            const nextUser = await tx.$queryRaw<CountRow[]>`
              UPDATE "UserDailyFreeUsage"
              SET "count" = "count" + 1, "updatedAt" = NOW()
              WHERE "userId" = ${userId} AND "day" = ${day} AND "count" < ${config.userLimit}
              RETURNING "count"
            `;
            if (nextUser.length === 0) {
              throw new FreeQuotaError(
                'free_user_limit_reached',
                'Your shared daily request limit is over. Use your own API key to continue chatting.'
              );
            }

            const nextGlobal = await tx.$queryRaw<CountRow[]>`
              UPDATE "GlobalDailyFreeUsage"
              SET "count" = "count" + 1, "updatedAt" = NOW()
              WHERE "day" = ${day} AND "count" < ${config.globalLimit}
              RETURNING "count"
            `;
            if (nextGlobal.length === 0) {
              // Roll back the user increment so a global miss does not consume user quota.
              await tx.$executeRaw`
                UPDATE "UserDailyFreeUsage"
                SET "count" = GREATEST("count" - 1, 0), "updatedAt" = NOW()
                WHERE "userId" = ${userId} AND "day" = ${day}
              `;
              throw new FreeQuotaError(
                'free_global_limit_reached',
                'No global shared API requests are left today. Use your own API key to continue.'
              );
            }

            return buildStatus(
              getDefaultSharedModel(),
              config.userLimit,
              config.globalLimit,
              nextUser[0]?.count ?? 0,
              nextGlobal[0]?.count ?? 0
            );
          },
          {
            isolationLevel: 'ReadCommitted'
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
  if (!isSharedCatalogConfigured()) {
    throw new Error('KeyLM shared catalog is not configured.');
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
          getDefaultSharedModel(),
          config.userLimit,
          config.globalLimit,
          nextUser?.count ?? 0,
          nextGlobal?.count ?? 0
        );
      },
      {
        isolationLevel: 'ReadCommitted'
      }
    )
  );
}
