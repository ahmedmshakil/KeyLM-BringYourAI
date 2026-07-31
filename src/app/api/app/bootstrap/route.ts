import { cookies } from 'next/headers';
import { Provider } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { DEMO_COOKIE, buildDemoUsageSnapshot } from '@/lib/demoSession';
import { getFreeTierConfig, getFreeUsageStatus, isFreeTierConfigured } from '@/lib/freeTier';
import { jsonResponse } from '@/lib/http';
import { withApiMetrics } from '@/lib/metrics';
import { toPublicUser } from '@/lib/userProfile';
import { listThreads } from '@/lib/services/threadService';
import { getRuntimeProvider } from '@/lib/services/threadRuntime';

const KEY_PROVIDER_IDS = ['openai', 'gemini', 'anthropic'] as const;

type KeyProviderId = (typeof KEY_PROVIDER_IDS)[number];
type ProviderKeySummary = {
  id: string;
  provider: KeyProviderId;
  keyMask: string;
  status: string;
  createdAt: Date;
  lastValidatedAt: Date | null;
  lastUsedAt: Date | null;
};
type ProviderSummary = Record<KeyProviderId, ProviderKeySummary[]>;
type ModelsSummary = Record<KeyProviderId, unknown[]>;
type ModelsMetaSummary = Record<KeyProviderId, { stale: boolean; fetchedAt: Date | undefined }>;

function createEmptyProviders(): ProviderSummary {
  return {
    openai: [],
    gemini: [],
    anthropic: []
  };
}

function createEmptyModels(): ModelsSummary {
  return {
    openai: [],
    gemini: [],
    anthropic: []
  };
}

function createEmptyModelsMeta(): ModelsMetaSummary {
  return {
    openai: { stale: false as boolean, fetchedAt: undefined as Date | undefined },
    gemini: { stale: false as boolean, fetchedAt: undefined as Date | undefined },
    anthropic: { stale: false as boolean, fetchedAt: undefined as Date | undefined }
  };
}

export const GET = withApiMetrics('/api/app/bootstrap', 'GET', async () => {
  const cookieStore = await cookies();
  const demo = buildDemoUsageSnapshot({
    enabled: isFreeTierConfigured(),
    model: getFreeTierConfig().model,
    token: cookieStore.get(DEMO_COOKIE)?.value
  });
  const user = await getSessionUser();

  if (!user) {
    return jsonResponse({
      user: null,
      providers: createEmptyProviders(),
      models: createEmptyModels(),
      modelsMeta: createEmptyModelsMeta(),
      threads: [],
      freeUsage: null,
      demo
    });
  }

  // Keys without ciphertext first so we can derive active key IDs, then parallelize
  // threads + freeUsage + model caches (no secret material in bootstrap payload).
  const keys = await prisma.providerKey.findMany({
    where: {
      userId: user.id,
      provider: {
        in: KEY_PROVIDER_IDS as unknown as Provider[]
      }
    },
    orderBy: [{ provider: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      provider: true,
      keyMask: true,
      status: true,
      createdAt: true,
      lastValidatedAt: true,
      lastUsedAt: true
    }
  });

  const providers = createEmptyProviders();
  for (const key of keys) {
    providers[key.provider as KeyProviderId].push({
      id: key.id,
      provider: key.provider as KeyProviderId,
      keyMask: key.keyMask,
      status: key.status,
      createdAt: key.createdAt,
      lastValidatedAt: key.lastValidatedAt,
      lastUsedAt: key.lastUsedAt
    });
  }

  const activeKeyIds = KEY_PROVIDER_IDS.flatMap((provider) => {
    const active = providers[provider].find((key) => key.status === 'active');
    return active ? [active.id] : [];
  });

  const [threads, freeUsage, caches] = await Promise.all([
    listThreads(user.id),
    getFreeUsageStatus(user.id),
    activeKeyIds.length
      ? prisma.providerModelCache.findMany({
          where: {
            userId: user.id,
            keyId: { in: activeKeyIds }
          },
          select: {
            keyId: true,
            models: true,
            expiresAt: true,
            fetchedAt: true
          }
        })
      : Promise.resolve([])
  ]);

  const cacheByKeyId = new Map(caches.map((cache) => [cache.keyId, cache]));
  const now = Date.now();
  const models = createEmptyModels();
  const modelsMeta = createEmptyModelsMeta();

  for (const provider of KEY_PROVIDER_IDS) {
    const active = providers[provider].find((key) => key.status === 'active');
    if (!active) {
      continue;
    }
    const cache = cacheByKeyId.get(active.id);
    if (!cache) {
      continue;
    }

    models[provider] = cache.models as typeof models.openai;
    modelsMeta[provider] = {
      stale: cache.expiresAt.getTime() <= now,
      fetchedAt: cache.fetchedAt
    };
  }

  return jsonResponse({
    user: toPublicUser(user),
    providers,
    models,
    modelsMeta,
    threads: threads.map((thread) => ({
      id: thread.id,
      provider: getRuntimeProvider(thread),
      model: thread.model,
      title: thread.title,
      status: thread.status,
      updatedAt: thread.updatedAt,
      lastMessage: thread.messages[0]?.content ?? null
    })),
    freeUsage,
    demo
  });
});
