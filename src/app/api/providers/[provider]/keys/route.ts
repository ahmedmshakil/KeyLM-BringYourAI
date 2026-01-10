import { Provider } from '@prisma/client';
import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { keyCreateSchema, providerSchema } from '@/lib/validators';
import { createKey } from '@/lib/services/keyService';
import { errorResponse, jsonResponse } from '@/lib/http';
import { mapProviderError } from '@/lib/services/providerErrors';

export async function POST(request: Request, { params }: { params: { provider: string } }) {
  const user = await requireUser();
  if (!user) {
    return errorResponse({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  }
  const provider = providerSchema.parse(params.provider) as Provider;
  try {
    const body = keyCreateSchema.parse(await request.json());
    const key = await createKey(user.id, provider, body.key);
    return jsonResponse({
      key: {
        id: key.id,
        provider: key.provider,
        keyMask: key.keyMask,
        status: key.status,
        createdAt: key.createdAt,
        lastValidatedAt: key.lastValidatedAt
      }
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Key validation failed';
    const mapped = mapProviderError(message);
    return errorResponse({
      code: mapped,
      message: 'Key validation failed',
      details: { provider }
    }, 422);
  }
}

export async function GET(request: Request, { params }: { params: { provider: string } }) {
  const user = await requireUser();
  if (!user) {
    return errorResponse({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  }
  const provider = providerSchema.parse(params.provider) as Provider;
  const keys = await prisma.providerKey.findMany({
    where: { userId: user.id, provider },
    orderBy: { createdAt: 'desc' }
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
