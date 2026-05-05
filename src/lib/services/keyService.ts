import { Provider } from '@prisma/client';
import { prisma } from '@/lib/db';
import { encryptSecret, decryptSecret, maskKey } from '@/lib/crypto';
import { getProviderAdapter } from '@/lib/providers';
import { withDatabaseMetrics } from '@/lib/metrics';

export async function createKey(userId: string, provider: Provider, rawKey: string) {
  const adapter = getProviderAdapter(provider);
  await adapter.validateKey(rawKey);
  const encrypted = encryptSecret(rawKey);
  const keyMask = maskKey(rawKey);
  const key = await withDatabaseMetrics('provider_key.create', () =>
    prisma.providerKey.create({
      data: {
        userId,
        provider,
        keyCiphertext: encrypted,
        keyMask,
        status: 'active',
        lastValidatedAt: new Date()
      }
    })
  );
  await withDatabaseMetrics('audit_log.create', () =>
    prisma.auditLog.create({
      data: {
        userId,
        provider,
        keyId: key.id,
        action: 'key.created',
        metadata: { keyMask }
      }
    })
  );
  return key;
}

async function getOwnedKey(userId: string, keyId: string, provider?: Provider) {
  const key = await withDatabaseMetrics('provider_key.find_owned', () =>
    prisma.providerKey.findFirst({ where: { id: keyId, userId } })
  );
  if (!key) {
    throw new Error('Key not found');
  }

  if (provider && key.provider !== provider) {
    throw new Error('Key not found');
  }

  return key;
}

export async function validateKey(userId: string, keyId: string, provider?: Provider) {
  const key = await getOwnedKey(userId, keyId, provider);
  const adapter = getProviderAdapter(key.provider);
  const rawKey = decryptSecret(key.keyCiphertext);
  await adapter.validateKey(rawKey);
  const updated = await withDatabaseMetrics('provider_key.update_validation', () =>
    prisma.providerKey.update({
      where: { id: key.id },
      data: { status: 'active', lastValidatedAt: new Date() }
    })
  );
  await withDatabaseMetrics('audit_log.create', () =>
    prisma.auditLog.create({
      data: {
        userId,
        provider: key.provider,
        keyId: key.id,
        action: 'key.validated'
      }
    })
  );
  return updated;
}

export async function revokeKey(userId: string, keyId: string, provider?: Provider) {
  const key = await getOwnedKey(userId, keyId, provider);
  const updated = await withDatabaseMetrics('provider_key.revoke', () =>
    prisma.providerKey.update({
      where: { id: key.id },
      data: { status: 'revoked' }
    })
  );
  await withDatabaseMetrics('audit_log.create', () =>
    prisma.auditLog.create({
      data: {
        userId,
        provider: key.provider,
        keyId: key.id,
        action: 'key.revoked'
      }
    })
  );
  return updated;
}

export async function getActiveKey(userId: string, provider: Provider) {
  return withDatabaseMetrics('provider_key.find_active', () =>
    prisma.providerKey.findFirst({
      where: { userId, provider, status: 'active' },
      orderBy: { lastValidatedAt: 'desc' }
    })
  );
}
