import { Provider } from '@prisma/client';
import { prisma } from '@/lib/db';
import { encryptSecret, decryptSecret, maskKey } from '@/lib/crypto';
import { getProviderAdapter } from '@/lib/providers';

export async function createKey(userId: string, provider: Provider, rawKey: string) {
  const adapter = getProviderAdapter(provider);
  await adapter.validateKey(rawKey);
  const encrypted = encryptSecret(rawKey);
  const keyMask = maskKey(rawKey);
  const key = await prisma.providerKey.create({
    data: {
      userId,
      provider,
      keyCiphertext: encrypted,
      keyMask,
      status: 'active',
      lastValidatedAt: new Date()
    }
  });
  await prisma.auditLog.create({
    data: {
      userId,
      provider,
      keyId: key.id,
      action: 'key.created',
      metadata: { keyMask }
    }
  });
  return key;
}

export async function validateKey(userId: string, keyId: string) {
  const key = await prisma.providerKey.findFirst({ where: { id: keyId, userId } });
  if (!key) {
    throw new Error('Key not found');
  }
  const adapter = getProviderAdapter(key.provider);
  const rawKey = decryptSecret(key.keyCiphertext);
  await adapter.validateKey(rawKey);
  const updated = await prisma.providerKey.update({
    where: { id: key.id },
    data: { status: 'active', lastValidatedAt: new Date() }
  });
  await prisma.auditLog.create({
    data: {
      userId,
      provider: key.provider,
      keyId: key.id,
      action: 'key.validated'
    }
  });
  return updated;
}

export async function revokeKey(userId: string, keyId: string) {
  const key = await prisma.providerKey.findFirst({ where: { id: keyId, userId } });
  if (!key) {
    throw new Error('Key not found');
  }
  const updated = await prisma.providerKey.update({
    where: { id: key.id },
    data: { status: 'revoked' }
  });
  await prisma.auditLog.create({
    data: {
      userId,
      provider: key.provider,
      keyId: key.id,
      action: 'key.revoked'
    }
  });
  return updated;
}

export async function getActiveKey(userId: string, provider: Provider) {
  return prisma.providerKey.findFirst({
    where: { userId, provider, status: 'active' },
    orderBy: { lastValidatedAt: 'desc' }
  });
}

export async function getRawKey(keyId: string) {
  const key = await prisma.providerKey.findUnique({ where: { id: keyId } });
  if (!key) {
    throw new Error('Key not found');
  }
  return decryptSecret(key.keyCiphertext);
}
