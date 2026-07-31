import { Provider } from '@prisma/client';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { keyCreateSchema, keyProviderSchema } from '@/lib/validators';
import { createKey } from '@/lib/services/keyService';
import { errorResponse, jsonResponse } from '@/lib/http';
import { mapProviderError } from '@/lib/services/providerErrors';
import { recordAppEvent, withApiMetrics } from '@/lib/metrics';

function parseProvider(rawProvider: string) {
  const parsed = keyProviderSchema.safeParse(rawProvider);
  if (!parsed.success) {
    return null;
  }

  return parsed.data as Provider;
}

export const POST = withApiMetrics(
  '/api/providers/[provider]/keys',
  'POST',
  async (request: Request, { params }: { params: Promise<{ provider: string }> }) => {
    const user = await requireUser();
    if (!user) {
      return errorResponse({ code: 'unauthorized', message: 'Unauthorized' }, 401);
    }
    const { provider: rawProvider } = await params;
    const provider = parseProvider(rawProvider);
    if (!provider) {
      return errorResponse({ code: 'invalid_provider', message: 'Unsupported provider' }, 400);
    }
    recordAppEvent('provider_key_create', 'started');
    const bodyResult = keyCreateSchema.safeParse(await request.json());
    if (!bodyResult.success) {
      recordAppEvent('provider_key_create', 'invalid_request');
      return errorResponse({ code: 'invalid_request', message: 'Invalid request' }, 400);
    }
    try {
      const key = await createKey(user.id, provider, bodyResult.data.key);
      recordAppEvent('provider_key_create', 'success');
      return jsonResponse(
        {
          key: {
            id: key.id,
            provider: key.provider,
            keyMask: key.keyMask,
            status: key.status,
            createdAt: key.createdAt,
            lastValidatedAt: key.lastValidatedAt
          }
        },
        { status: 201 }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Key validation failed';
      const mapped = mapProviderError(message);
      recordAppEvent('provider_key_create', 'failure');
      return errorResponse(
        {
          code: mapped,
          message: 'Key validation failed',
          details: { provider }
        },
        422
      );
    }
  }
);

export const GET = withApiMetrics(
  '/api/providers/[provider]/keys',
  'GET',
  async (request: Request, { params }: { params: Promise<{ provider: string }> }) => {
    const user = await requireUser();
    if (!user) {
      return errorResponse({ code: 'unauthorized', message: 'Unauthorized' }, 401);
    }
    const { provider: rawProvider } = await params;
    const provider = parseProvider(rawProvider);
    if (!provider) {
      return errorResponse({ code: 'invalid_provider', message: 'Unsupported provider' }, 400);
    }
    const keys = await prisma.providerKey.findMany({
      where: { userId: user.id, provider },
      orderBy: { createdAt: 'desc' },
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
    return jsonResponse({
      keys: keys.map((key) => ({
        id: key.id,
        provider: key.provider,
        keyMask: key.keyMask,
        status: key.status,
        createdAt: key.createdAt,
        lastValidatedAt: key.lastValidatedAt,
        lastUsedAt: key.lastUsedAt
      }))
    });
  }
);
