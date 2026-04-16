import { Provider } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getFreeUsageStatus } from '@/lib/freeTier';
import { jsonResponse } from '@/lib/http';
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

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return jsonResponse({
      user: null,
      providers: createEmptyProviders(),
      models: createEmptyModels(),
      modelsMeta: createEmptyModelsMeta(),
      threads: [],
      freeUsage: null
    });
  }

  const [keys, threads, freeUsage] = await Promise.all([
    prisma.providerKey.findMany({
      where: {
        userId: user.id,
        provider: {
          in: KEY_PROVIDER_IDS as unknown as Provider[]
        }
      },
      orderBy: [{ provider: 'asc' }, { createdAt: 'desc' }]
    }),
    listThreads(user.id),
    getFreeUsageStatus(user.id)
  ]);

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

  const activeKeys: Array<{ provider: KeyProviderId; keyId: string }> = KEY_PROVIDER_IDS.flatMap((provider) => {
    const active = providers[provider].find((key) => key.status === 'active');
    return active ? [{ provider, keyId: active.id }] : [];
  });

  const caches = activeKeys.length
    ? await prisma.providerModelCache.findMany({
        where: {
          userId: user.id,
          keyId: {
            in: activeKeys.map((item) => item.keyId)
          }
        }
      })
    : [];

  const cacheByKeyId = new Map(caches.map((cache) => [cache.keyId, cache]));
  const now = Date.now();
  const models = createEmptyModels();
  const modelsMeta = createEmptyModelsMeta();

  for (const activeKey of activeKeys) {
    const cache = cacheByKeyId.get(activeKey.keyId);
    if (!cache) {
      continue;
    }

    models[activeKey.provider] = cache.models as typeof models.openai;
    modelsMeta[activeKey.provider] = {
      stale: cache.expiresAt.getTime() <= now,
      fetchedAt: cache.fetchedAt
    };
  }

  return jsonResponse({
    user: {
      id: user.id,
      email: user.email
    },
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
    freeUsage
  });
}