import { getSessionUser } from '@/lib/auth';
import { jsonResponse } from '@/lib/http';
import { withApiMetrics } from '@/lib/metrics';
import { toPublicUser } from '@/lib/userProfile';

export const GET = withApiMetrics('/api/auth/me', 'GET', async () => {
  const user = await getSessionUser();
  if (!user) {
    return jsonResponse({ user: null }, { status: 401 });
  }
  return jsonResponse({ user: toPublicUser(user) });
});
