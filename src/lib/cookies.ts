import { cookies } from 'next/headers';
import { DEMO_COOKIE, DEMO_COOKIE_MAX_AGE } from '@/lib/demoSession';
import { SESSION_COOKIE, SESSION_MAX_AGE } from '@/lib/session';

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_MAX_AGE,
    path: '/'
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/'
  });
}

export async function setDemoCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set({
    name: DEMO_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: DEMO_COOKIE_MAX_AGE,
    path: '/'
  });
}

export async function clearDemoCookie() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: DEMO_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/'
  });
}
