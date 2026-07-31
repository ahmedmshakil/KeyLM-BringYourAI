import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { SESSION_COOKIE, verifySession } from '@/lib/session';

export type SessionUser = {
  id: string;
  email: string;
  createdAt: Date;
  sessionVersion?: number;
  fullName: string | null;
  profileImageUrl: string | null;
};

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

  // Columns are part of the base schema — no runtime information_schema probes on the hot path.
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      createdAt: true,
      sessionVersion: true,
      fullName: true,
      profileImageUrl: true
    }
  });
  if (!user || user.sessionVersion !== payload.ver) {
    return null;
  }
  return user;
}

export async function requireUser() {
  const user = await getSessionUser();
  return user ?? null;
}
