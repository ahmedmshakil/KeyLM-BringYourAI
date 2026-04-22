import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { supportsSessionVersion, supportsUserProfileFields } from '@/lib/dbCompat';
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

  const [sessionVersionEnabled, profileFieldsEnabled] = await Promise.all([
    supportsSessionVersion(),
    supportsUserProfileFields()
  ]);

  if (sessionVersionEnabled && profileFieldsEnabled) {
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

  if (sessionVersionEnabled) {
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
    return {
      ...user,
      fullName: null,
      profileImageUrl: null
    } satisfies SessionUser;
  }

  if (profileFieldsEnabled) {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        createdAt: true,
        fullName: true,
        profileImageUrl: true
      }
    });
    return user;
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      createdAt: true
    }
  });

  if (!user) {
    return null;
  }

  return {
    ...user,
    fullName: null,
    profileImageUrl: null
  } satisfies SessionUser;
}

export async function requireUser() {
  const user = await getSessionUser();
  return user ?? null;
}
