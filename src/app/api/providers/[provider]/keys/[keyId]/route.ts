import { requireUser } from '@/lib/auth';
import { keyProviderSchema } from '@/lib/validators';
import { revokeKey } from '@/lib/services/keyService';
import { errorResponse, jsonResponse } from '@/lib/http';
import { recordAppEvent, withApiMetrics } from '@/lib/metrics';

function parseProvider(rawProvider: string) {
  const parsed = keyProviderSchema.safeParse(rawProvider);
  return parsed.success ? parsed.data : null;
}

export const DELETE = withApiMetrics(
  '/api/providers/[provider]/keys/[keyId]',
  'DELETE',
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
    recordAppEvent('provider_key_revoke', 'started');

    try {
      await revokeKey(user.id, resolvedParams.keyId, provider);
      recordAppEvent('provider_key_revoke', 'success');
      return jsonResponse({ ok: true });
    } catch (error) {
      recordAppEvent('provider_key_revoke', 'not_found');
      return errorResponse({ code: 'not_found', message: 'Key not found' }, 404);
    }
  }
);
