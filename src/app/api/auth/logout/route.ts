import { clearSessionCookie } from '@/lib/cookies';
import { jsonResponse } from '@/lib/http';

export async function POST() {
  clearSessionCookie();
  return jsonResponse({ ok: true });
}
