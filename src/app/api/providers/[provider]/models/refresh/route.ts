import { Provider } from '@prisma/client';
import { requireUser } from '@/lib/auth';
import { keyProviderSchema } from '@/lib/validators';
import { getModels } from '@/lib/services/modelService';
import { errorResponse, jsonResponse } from '@/lib/http';
import { recordAppEvent, withApiMetrics } from '@/lib/metrics';

function parseProvider(rawProvider: string) {
  const parsed = keyProviderSchema.safeParse(rawProvider);
  return parsed.success ? (parsed.data as Provider) : null;
}

export const POST = withApiMetrics(
  '/api/providers/[provider]/models/refresh',
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
    recordAppEvent('provider_model_refresh', 'started');
    try {
      const result = await getModels(user.id, provider, true);
      recordAppEvent('provider_model_refresh', 'success');
      return jsonResponse({
        models: result.models,
        stale: result.stale,
        fetchedAt: result.fetchedAt
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'No active key') {
        recordAppEvent('provider_model_refresh', 'key_missing');
        return errorResponse({ code: 'key_missing', message: 'Connect a key first' }, 400);
      }
      recordAppEvent('provider_model_refresh', 'failure');
      return errorResponse({ code: 'models_unavailable', message: 'Failed to refresh models' }, 502);
    }
  }
);
