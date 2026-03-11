import { requireUser } from '@/lib/auth';
import { getFreeUsageStatus } from '@/lib/freeTier';
import { errorResponse, jsonResponse } from '@/lib/http';

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return errorResponse({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  }

  const usage = await getFreeUsageStatus(user.id);
  return jsonResponse(usage);
}
