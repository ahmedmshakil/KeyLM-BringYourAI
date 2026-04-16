import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { supportsSessionVersion } from '@/lib/dbCompat';
import { SESSION_COOKIE, verifySession } from '@/lib/session';

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }
  const payload = verifySession(token);
  if (!payload) {
    return null;
  }

  if (await supportsSessionVersion()) {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        createdAt: true,
        sessionVersion: true
      }
    });
    if (!user || user.sessionVersion !== payload.ver) {
      return null;
    }
    return user;
  }

  return prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      createdAt: true
    }
  });
}

export async function requireUser() {
  const user = await getSessionUser();
  return user ?? null;
}
