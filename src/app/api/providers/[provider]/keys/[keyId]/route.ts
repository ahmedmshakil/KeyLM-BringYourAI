import { requireUser } from '@/lib/auth';
import { providerSchema } from '@/lib/validators';
import { revokeKey } from '@/lib/services/keyService';
import { errorResponse, jsonResponse } from '@/lib/http';

export async function DELETE(request: Request, { params }: { params: { provider: string; keyId: string } }) {
  const user = await requireUser();
  if (!user) {
    return errorResponse({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  }
  providerSchema.parse(params.provider);
  await revokeKey(user.id, params.keyId);
  return jsonResponse({ ok: true });
}
