import { Provider } from '@prisma/client';
import { requireUser } from '@/lib/auth';
import { keyProviderSchema } from '@/lib/validators';
import { validateKey } from '@/lib/services/keyService';
import { errorResponse, jsonResponse } from '@/lib/http';
import { mapProviderError } from '@/lib/services/providerErrors';
import { recordAppEvent, withApiMetrics } from '@/lib/metrics';

function parseProvider(rawProvider: string) {
  const parsed = keyProviderSchema.safeParse(rawProvider);
  return parsed.success ? (parsed.data as Provider) : null;
}

export const POST = withApiMetrics(
  '/api/providers/[provider]/keys/[keyId]/validate',
  'POST',
  async (request: Request, { params }: { params: Promise<{ provider: string; keyId: string }> }) => {
    const user = await requireUser();
    if (!user) {
      return errorResponse({ code: 'unauthorized', message: 'Unauthorized' }, 401);
    }
    const resolvedParams = await params;
    const provider = parseProvider(resolvedParams.provider);
    if (!provider) {
      return errorResponse({ code: 'invalid_provider', message: 'Unsupported provider' }, 400);
    }
    recordAppEvent('provider_key_validate', 'started');
    try {
      const updated = await validateKey(user.id, resolvedParams.keyId, provider);
      recordAppEvent('provider_key_validate', 'success');
      return jsonResponse({
        key: {
          id: updated.id,
          provider: updated.provider,
          keyMask: updated.keyMask,
          status: updated.status,
          lastValidatedAt: updated.lastValidatedAt
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Key validation failed';
      if (message === 'Key not found') {
        recordAppEvent('provider_key_validate', 'not_found');
        return errorResponse({ code: 'not_found', message: 'Key not found' }, 404);
      }
      const mapped = mapProviderError(message);
      recordAppEvent('provider_key_validate', 'failure');
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
