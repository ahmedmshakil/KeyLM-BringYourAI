import { Provider } from '@prisma/client';
import { requireUser } from '@/lib/auth';
import { providerSchema } from '@/lib/validators';
import { validateKey } from '@/lib/services/keyService';
import { errorResponse, jsonResponse } from '@/lib/http';
import { mapProviderError } from '@/lib/services/providerErrors';

export async function POST(request: Request, { params }: { params: { provider: string; keyId: string } }) {
  const user = await requireUser();
  if (!user) {
    return errorResponse({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  }
  const provider = providerSchema.parse(params.provider) as Provider;
  try {
    const updated = await validateKey(user.id, params.keyId);
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
    const mapped = mapProviderError(message);
    return errorResponse({
      code: mapped,
      message: 'Key validation failed',
      details: { provider }
    }, 422);
  }
}
