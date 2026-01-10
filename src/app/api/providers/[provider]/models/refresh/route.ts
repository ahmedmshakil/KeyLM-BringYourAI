import { Provider } from '@prisma/client';
import { requireUser } from '@/lib/auth';
import { providerSchema } from '@/lib/validators';
import { getModels } from '@/lib/services/modelService';
import { errorResponse, jsonResponse } from '@/lib/http';

export async function POST(request: Request, { params }: { params: { provider: string } }) {
  const user = await requireUser();
  if (!user) {
    return errorResponse({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  }
  const provider = providerSchema.parse(params.provider) as Provider;
  try {
    const result = await getModels(user.id, provider, true);
    return jsonResponse({
      models: result.models,
      stale: result.stale,
      fetchedAt: result.fetchedAt
    });
  } catch (error) {
    return errorResponse({ code: 'models_unavailable', message: 'Failed to refresh models' }, 502);
  }
}
