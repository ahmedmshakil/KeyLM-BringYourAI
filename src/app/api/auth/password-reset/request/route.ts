import { z } from 'zod';
import { prisma } from '@/lib/db';
import { errorResponse, jsonResponse } from '@/lib/http';
import { createPasswordResetToken } from '@/lib/passwordReset';
import { takeToken } from '@/lib/rateLimit';

const requestSchema = z.object({
  email: z.string().email()
});

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
    const email = body.email.trim();
    if (!takeToken(`password-reset:${email}`, 5)) {
      return errorResponse({ code: 'rate_limited', message: 'Too many reset attempts. Try again soon.' }, 429);
    }
    const user = await prisma.user.findUnique({ where: { email } });
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
