import { z } from 'zod';
import { prisma } from '@/lib/db';
import { errorResponse, getClientIp, jsonResponse } from '@/lib/http';
import { createPasswordResetToken } from '@/lib/passwordReset';
import { takeToken } from '@/lib/rateLimit';
import { authEmailSchema, normalizeEmail } from '@/lib/validators';

const requestSchema = z.object({
  email: authEmailSchema
});

const PASSWORD_RESET_REQUEST_LIMIT = 5;
const PASSWORD_RESET_WINDOW_MS = 15 * 60_000;

function buildResetUrl(request: Request, token: string): string {
  const configuredBase = process.env.APP_PUBLIC_BASE_URL?.replace(/\/$/, '');
  const origin = request.headers.get('origin')?.replace(/\/$/, '');
  const base = configuredBase || origin;
  if (!base) {
    return `/reset?token=${token}`;
  }
  return `${base}/reset?token=${token}`;
}

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const email = normalizeEmail(body.email);
    const clientIp = getClientIp(request);
    const allowed = await takeToken(
      `password-reset:request:${clientIp}:${email}`,
      PASSWORD_RESET_REQUEST_LIMIT,
      PASSWORD_RESET_WINDOW_MS
    );
    if (!allowed) {
      return errorResponse({ code: 'rate_limited', message: 'Too many reset attempts. Try again soon.' }, 429);
    }
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true }
    });
    if (!user) {
      return jsonResponse({ ok: true });
    }
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null }
    });
    const token = createPasswordResetToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: token.tokenHash,
        expiresAt: token.expiresAt
      }
    });
    if (process.env.NODE_ENV !== 'production') {
      return jsonResponse({
        ok: true,
        resetUrl: buildResetUrl(request, token.token)
      });
    }
    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse({ code: 'invalid_request', message: 'Invalid request' }, 400);
  }
}
