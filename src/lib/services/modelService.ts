import { Provider } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getProviderAdapter } from '@/lib/providers';
import { decryptSecret } from '@/lib/crypto';
import { NormalizedModel } from '@/lib/providers/types';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function filterModels(provider: Provider, models: NormalizedModel[]) {
  if (provider === 'openai') {
    const filtered = models.filter(
      (model) => model.id.startsWith('gpt-') && !model.id.includes('instruct') && !model.id.includes('realtime')
    );
    return filtered.length > 0 ? filtered : models;
  }
  if (provider === 'gemini') {
    const filtered = models.filter((model) => model.capabilities.streaming);
    return filtered.length > 0 ? filtered : models;
  }
  return models;
}

export async function getModels(userId: string, provider: Provider, refresh = false) {
  const key = await prisma.providerKey.findFirst({
    where: { userId, provider, status: 'active' },
    orderBy: { lastValidatedAt: 'desc' }
  });
  if (!key) {
    throw new Error('No active key');
  }

  const now = new Date();
  const cache = await prisma.providerModelCache.findFirst({
    where: { userId, provider, keyId: key.id }
  });

  const isExpired = cache ? cache.expiresAt.getTime() <= now.getTime() : true;
  if (!refresh && cache && !isExpired) {
    return {
      models: filterModels(provider, cache.models as NormalizedModel[]),
      stale: false,
      fetchedAt: cache.fetchedAt
    };
  }

  const adapter = getProviderAdapter(provider);
  const rawKey = decryptSecret(key.keyCiphertext);

  try {
    const models = filterModels(provider, await adapter.listModels(rawKey));
    const fetchedAt = new Date();
    const expiresAt = new Date(fetchedAt.getTime() + CACHE_TTL_MS);

    if (cache) {
      await prisma.providerModelCache.update({
        where: { id: cache.id },
        data: { models, fetchedAt, expiresAt }
      });
    } else {
      await prisma.providerModelCache.create({
        data: { userId, provider, keyId: key.id, models, fetchedAt, expiresAt }
      });
    }

    return { models, stale: false, fetchedAt };
  } catch (error) {
    if (cache) {
      return {
        models: filterModels(provider, cache.models as NormalizedModel[]),
        stale: true,
        fetchedAt: cache.fetchedAt
      };
    }
    throw error;
  }
}
