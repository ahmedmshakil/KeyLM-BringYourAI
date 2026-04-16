import { requireUser } from '@/lib/auth';
import { keyProviderSchema } from '@/lib/validators';
import { revokeKey } from '@/lib/services/keyService';
import { errorResponse, jsonResponse } from '@/lib/http';

function parseProvider(rawProvider: string) {
  const parsed = keyProviderSchema.safeParse(rawProvider);
  return parsed.success ? parsed.data : null;
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ provider: string; keyId: string }> }
) {
  const user = await requireUser();
  if (!user) {
    return errorResponse({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  }
  const resolvedParams = await params;
  const provider = parseProvider(resolvedParams.provider);
  if (!provider) {
    return errorResponse({ code: 'invalid_provider', message: 'Unsupported provider' }, 400);
  }

  try {
    await revokeKey(user.id, resolvedParams.keyId, provider);
    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse({ code: 'not_found', message: 'Key not found' }, 404);
  }
}
