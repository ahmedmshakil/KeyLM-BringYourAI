import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { signSession } from '@/lib/session';
import { setSessionCookie } from '@/lib/cookies';
import { errorResponse, jsonResponse } from '@/lib/http';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export async function POST(request: Request) {
  try {
    const body = registerSchema.parse(await request.json());
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return errorResponse({ code: 'email_taken', message: 'Email already registered' }, 409);
    }
    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: { email: body.email, passwordHash }
    });
    const token = signSession(user.id);
    setSessionCookie(token);
    return jsonResponse({ user: { id: user.id, email: user.email } }, { status: 201 });
  } catch (error) {
    return errorResponse({ code: 'invalid_request', message: 'Invalid request' }, 400);
  }
}
