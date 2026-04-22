import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { supportsSessionVersion } from '@/lib/dbCompat';
import { signSession } from '@/lib/session';
import { setSessionCookie } from '@/lib/cookies';
import { errorResponse, getClientIp, jsonResponse } from '@/lib/http';
import { toPublicUser } from '@/lib/userProfile';
import { authEmailSchema, authPasswordSchema, normalizeEmail } from '@/lib/validators';
import { takeToken } from '@/lib/rateLimit';

const registerSchema = z.object({
  email: authEmailSchema,
  password: authPasswordSchema
});

const REGISTER_RATE_LIMIT = 5;
const AUTH_WINDOW_MS = 15 * 60_000;

export async function POST(request: Request) {
  try {
    const body = registerSchema.parse(await request.json());
    const email = normalizeEmail(body.email);
    const sessionVersionEnabled = await supportsSessionVersion();
    const clientIp = getClientIp(request);
    const allowed = await takeToken(`auth:register:${clientIp}:${email}`, REGISTER_RATE_LIMIT, AUTH_WINDOW_MS);
    if (!allowed) {
      return errorResponse({ code: 'rate_limited', message: 'Too many registration attempts. Try again soon.' }, 429);
    }

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return errorResponse({ code: 'email_taken', message: 'Email already registered' }, 409);
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = sessionVersionEnabled
      ? await prisma.user.create({
          data: { email, passwordHash },
          select: { id: true, email: true, sessionVersion: true }
        })
      : await prisma.user.create({
          data: { email, passwordHash },
          select: { id: true, email: true }
        });
    let sessionVersion = 0;
    if (sessionVersionEnabled && 'sessionVersion' in user && typeof user.sessionVersion === 'number') {
      sessionVersion = user.sessionVersion;
    }
    const token = signSession(user.id, sessionVersion);
    await setSessionCookie(token);
    return jsonResponse({ user: toPublicUser(user) }, { status: 201 });
  } catch (error) {
    return errorResponse({ code: 'invalid_request', message: 'Invalid request' }, 400);
  }
}
