import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { signSession } from '@/lib/session';
import { setSessionCookie } from '@/lib/cookies';
import { errorResponse, jsonResponse } from '@/lib/http';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export async function POST(request: Request) {
  try {
    const body = loginSchema.parse(await request.json());
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) {
      return errorResponse({ code: 'invalid_credentials', message: 'Invalid credentials' }, 401);
    }
    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) {
      return errorResponse({ code: 'invalid_credentials', message: 'Invalid credentials' }, 401);
    }
    const token = signSession(user.id);
    setSessionCookie(token);
    return jsonResponse({ user: { id: user.id, email: user.email } });
  } catch (error) {
    return errorResponse({ code: 'invalid_request', message: 'Invalid request' }, 400);
  }
}
