import { getSessionUser } from '@/lib/auth';
import { jsonResponse } from '@/lib/http';

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return jsonResponse({ user: null }, { status: 401 });
  }
  return jsonResponse({ user: { id: user.id, email: user.email } });
}
