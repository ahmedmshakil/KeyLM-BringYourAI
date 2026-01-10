import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { errorResponse, jsonResponse } from '@/lib/http';
import { hashPasswordResetToken } from '@/lib/passwordReset';

const confirmSchema = z.object({
  token: z.string().min(32),
  password: z.string().min(8)
});

export async function POST(request: Request) {
  try {
    const body = confirmSchema.parse(await request.json());
    const tokenHash = hashPasswordResetToken(body.token.trim());
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
    await prisma.$transaction([
      prisma.user.update({
        where: { id: reset.userId },
        data: { passwordHash }
      }),
      prisma.passwordResetToken.update({
        where: { id: reset.id },
        data: { usedAt: new Date() }
      }),
      prisma.passwordResetToken.updateMany({
        where: { userId: reset.userId, usedAt: null },
        data: { usedAt: new Date() }
      })
    ]);
    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse({ code: 'invalid_request', message: 'Invalid request' }, 400);
  }
}
