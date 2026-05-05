import { requireUser } from '@/lib/auth';
import { getFreeUsageStatus } from '@/lib/freeTier';
import { errorResponse, jsonResponse } from '@/lib/http';
import { withApiMetrics } from '@/lib/metrics';

export const GET = withApiMetrics('/api/usage/free', 'GET', async () => {
  const user = await requireUser();
  if (!user) {
    return errorResponse({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  }

  const usage = await getFreeUsageStatus(user.id);
  return jsonResponse(usage);
});
