import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { supportsSessionVersion } from '@/lib/dbCompat';
import { signSession } from '@/lib/session';
import { setSessionCookie } from '@/lib/cookies';
import { errorResponse, getClientIp, jsonResponse } from '@/lib/http';
import { authEmailSchema, authPasswordSchema, normalizeEmail } from '@/lib/validators';
import { takeToken } from '@/lib/rateLimit';

const loginSchema = z.object({
  email: authEmailSchema,
  password: authPasswordSchema
});

const LOGIN_RATE_LIMIT = 10;
const AUTH_WINDOW_MS = 15 * 60_000;

export async function POST(request: Request) {
  try {
    const body = loginSchema.parse(await request.json());
    const email = normalizeEmail(body.email);
    const sessionVersionEnabled = await supportsSessionVersion();
    const clientIp = getClientIp(request);
    const allowed = await takeToken(`auth:login:${clientIp}:${email}`, LOGIN_RATE_LIMIT, AUTH_WINDOW_MS);
    if (!allowed) {
      return errorResponse({ code: 'rate_limited', message: 'Too many login attempts. Try again soon.' }, 429);
    }

    const user = sessionVersionEnabled
      ? await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, passwordHash: true, sessionVersion: true }
        })
      : await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, passwordHash: true }
        });
    if (!user) {
      return errorResponse({ code: 'invalid_credentials', message: 'Invalid credentials' }, 401);
    }
    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) {
      return errorResponse({ code: 'invalid_credentials', message: 'Invalid credentials' }, 401);
    }
    let sessionVersion = 0;
    if (sessionVersionEnabled && 'sessionVersion' in user && typeof user.sessionVersion === 'number') {
      sessionVersion = user.sessionVersion;
    }
    const token = signSession(user.id, sessionVersion);
    await setSessionCookie(token);
    return jsonResponse({ user: { id: user.id, email: user.email } });
  } catch (error) {
    return errorResponse({ code: 'invalid_request', message: 'Invalid request' }, 400);
  }
}
