import { clearSessionCookie } from '@/lib/cookies';
import { jsonResponse } from '@/lib/http';
import { recordAuthEvent, withApiMetrics } from '@/lib/metrics';

export const POST = withApiMetrics('/api/auth/logout', 'POST', async () => {
  await clearSessionCookie();
  recordAuthEvent('logout', 'success');
  return jsonResponse({ ok: true });
});
