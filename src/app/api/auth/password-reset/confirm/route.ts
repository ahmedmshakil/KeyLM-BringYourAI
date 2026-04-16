import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { supportsSessionVersion } from '@/lib/dbCompat';
import { errorResponse, getClientIp, jsonResponse } from '@/lib/http';
import { hashPasswordResetToken } from '@/lib/passwordReset';
import { authPasswordSchema } from '@/lib/validators';
import { takeToken } from '@/lib/rateLimit';

const confirmSchema = z.object({
  token: z.string().trim().min(32).max(256),
  password: authPasswordSchema
});

const PASSWORD_RESET_CONFIRM_LIMIT = 10;
const PASSWORD_RESET_WINDOW_MS = 15 * 60_000;

export async function POST(request: Request) {
  try {
    const body = confirmSchema.parse(await request.json());
    const sessionVersionEnabled = await supportsSessionVersion();
    const tokenHash = hashPasswordResetToken(body.token.trim());
    const clientIp = getClientIp(request);
    const allowed = await takeToken(
      `password-reset:confirm:${clientIp}:${tokenHash}`,
      PASSWORD_RESET_CONFIRM_LIMIT,
      PASSWORD_RESET_WINDOW_MS
    );
    if (!allowed) {
      return errorResponse({ code: 'rate_limited', message: 'Too many reset attempts. Try again soon.' }, 429);
    }

    const reset = await prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() }
      }
    });
    if (!reset) {
      return errorResponse({ code: 'invalid_token', message: 'Reset token is invalid or expired.' }, 400);
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: reset.userId },
        data: sessionVersionEnabled
          ? {
              passwordHash,
              sessionVersion: {
                increment: 1
              }
            }
          : {
              passwordHash
            },
        select: { id: true }
      });
      await tx.passwordResetToken.update({
        where: { id: reset.id },
        data: { usedAt: new Date() }
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: reset.userId, usedAt: null },
        data: { usedAt: new Date() }
      });
    });
    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse({ code: 'invalid_request', message: 'Invalid request' }, 400);
  }
}
