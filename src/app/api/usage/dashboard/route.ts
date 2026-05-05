import { requireUser } from '@/lib/auth';
import { errorResponse, jsonResponse } from '@/lib/http';
import { withApiMetrics } from '@/lib/metrics';
import { getUsageDashboard } from '@/lib/services/usageDashboardService';

export const GET = withApiMetrics('/api/usage/dashboard', 'GET', async () => {
  const user = await requireUser();
  if (!user) {
    return errorResponse({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  }

  try {
    const dashboard = await getUsageDashboard(user.id);
    return jsonResponse(dashboard);
  } catch (error) {
    return errorResponse(
      {
        code: 'usage_dashboard_failed',
        message: error instanceof Error ? error.message : 'Failed to load usage dashboard'
      },
      500
    );
  }
});
