import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { supportsSessionVersion, supportsUserProfileFields } from '@/lib/dbCompat';
import { signSession } from '@/lib/session';
import { setSessionCookie } from '@/lib/cookies';
import { errorResponse, getClientIp, jsonResponse } from '@/lib/http';
import { toPublicUser } from '@/lib/userProfile';
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
    const [sessionVersionEnabled, profileFieldsEnabled] = await Promise.all([
      supportsSessionVersion(),
      supportsUserProfileFields()
    ]);
    const clientIp = getClientIp(request);
    const allowed = await takeToken(`auth:login:${clientIp}:${email}`, LOGIN_RATE_LIMIT, AUTH_WINDOW_MS);
    if (!allowed) {
      return errorResponse({ code: 'rate_limited', message: 'Too many login attempts. Try again soon.' }, 429);
    }

    const user = sessionVersionEnabled
      ? await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            passwordHash: true,
            sessionVersion: true,
            ...(profileFieldsEnabled ? { fullName: true, profileImageUrl: true } : {})
          }
        })
      : await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            passwordHash: true,
            ...(profileFieldsEnabled ? { fullName: true, profileImageUrl: true } : {})
          }
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
    return jsonResponse({ user: toPublicUser(user) });
  } catch (error) {
    return errorResponse({ code: 'invalid_request', message: 'Invalid request' }, 400);
  }
}
