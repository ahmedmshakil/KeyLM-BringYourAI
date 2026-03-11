import { clearSessionCookie } from '@/lib/cookies';
import { jsonResponse } from '@/lib/http';

export async function POST() {
  await clearSessionCookie();
  return jsonResponse({ ok: true });
}
