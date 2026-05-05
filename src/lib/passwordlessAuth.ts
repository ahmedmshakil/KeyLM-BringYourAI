import { createClient as createSupabaseClient, type User as SupabaseUser } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';
import { supportsSessionVersion, supportsUserProfileFields } from '@/lib/dbCompat';
import { setSessionCookie } from '@/lib/cookies';
import { signSession } from '@/lib/session';
import { normalizeEmail } from '@/lib/validators';
import { toPublicUser, type PublicUser } from '@/lib/userProfile';
import { createClient as createSupabaseServerClient } from '@/utils/supabase/server';
import { recordSupabaseAuthRequest, withDatabaseMetrics } from '@/lib/metrics';

export type PasswordlessMethod = 'magic_link' | 'otp';
export type PasswordlessIntent = 'login' | 'register';

export class PasswordlessAuthError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'PasswordlessAuthError';
    this.code = code;
    this.status = status;
  }
}

function getSupabaseConfig() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    throw new PasswordlessAuthError(
      'supabase_not_configured',
      'Supabase Auth is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY first.',
      500
    );
  }

  return { supabaseUrl, supabasePublishableKey };
}

export function createSupabasePasswordlessClient() {
  const { supabaseUrl, supabasePublishableKey } = getSupabaseConfig();

  return createSupabaseClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false
    }
  });
}

export async function createSupabasePasswordlessServerClient() {
  try {
    const cookieStore = await cookies();
    return createSupabaseServerClient(cookieStore);
  } catch (error) {
    if (error instanceof PasswordlessAuthError) {
      throw error;
    }

    throw new PasswordlessAuthError(
      'supabase_not_configured',
      'Supabase Auth is not configured yet. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY first.',
      500
    );
  }
}

export function getAppBaseUrl(request: Request) {
  const configuredBase = process.env.APP_PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (configuredBase) {
    return configuredBase;
  }

  const origin = request.headers.get('origin')?.replace(/\/$/, '');
  if (origin) {
    return origin;
  }

  return new URL(request.url).origin;
}

export function buildPasswordlessRedirectUrl(request: Request) {
  return `${getAppBaseUrl(request)}/auth/callback`;
}

export async function sendPasswordlessEmail({
  email,
  captchaToken,
  intent,
  request
}: {
  email: string;
  captchaToken: string;
  method: PasswordlessMethod;
  intent: PasswordlessIntent;
  request: Request;
}) {
  const supabase = await createSupabasePasswordlessServerClient();
  const redirectTo = buildPasswordlessRedirectUrl(request);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: intent === 'register',
      emailRedirectTo: redirectTo,
      captchaToken
    }
  });

  if (error) {
    recordSupabaseAuthRequest('passwordless_send', 'failure');
    const isMissingAccount = error.message.toLowerCase().includes('signup') || error.status === 422;
    throw new PasswordlessAuthError(
      isMissingAccount ? 'account_not_found' : 'passwordless_send_failed',
      isMissingAccount
        ? 'No passwordless account exists for this email yet. Create an account first.'
        : error.message || 'Could not send the passwordless email right now.',
      isMissingAccount ? 404 : error.status || 400
    );
  }

  recordSupabaseAuthRequest('passwordless_send', 'success');
}

export async function createAppSessionForSupabaseUser(supabaseUser: SupabaseUser): Promise<PublicUser> {
  if (!supabaseUser.email) {
    throw new PasswordlessAuthError('missing_email', 'Supabase did not return an email for this user.', 400);
  }

  const email = normalizeEmail(supabaseUser.email);
  const now = new Date();
  const [sessionVersionEnabled, profileFieldsEnabled] = await Promise.all([
    supportsSessionVersion(),
    supportsUserProfileFields()
  ]);
  const select = {
    id: true,
    email: true,
    ...(sessionVersionEnabled ? { sessionVersion: true } : {}),
    ...(profileFieldsEnabled ? { fullName: true, profileImageUrl: true } : {})
  };

  const linkedUser = await withDatabaseMetrics('auth.supabase_user_lookup', () =>
    prisma.user.findUnique({
      where: { supabaseUserId: supabaseUser.id },
      select
    })
  );

  const user = linkedUser
    ? await withDatabaseMetrics('auth.user_update_after_login', () =>
        prisma.user.update({
          where: { id: linkedUser.id },
          data: {
            email,
            lastLoginAt: now
          },
          select
        })
      )
    : await withDatabaseMetrics('auth.user_upsert_after_login', () =>
        prisma.user.upsert({
          where: { email },
          update: {
            supabaseUserId: supabaseUser.id,
            lastLoginAt: now
          },
          create: {
            email,
            supabaseUserId: supabaseUser.id,
            lastLoginAt: now
          },
          select
        })
      );

  const sessionVersion =
    sessionVersionEnabled && 'sessionVersion' in user && typeof user.sessionVersion === 'number'
      ? user.sessionVersion
      : 0;
  const token = signSession(user.id, sessionVersion);
  await setSessionCookie(token);

  return toPublicUser(user);
}

export function getPasswordlessSuccessMessage(method: PasswordlessMethod) {
  return method === 'otp'
    ? 'OTP sent. Check your email and enter the 6-digit code within 15 minutes.'
    : 'Magic link sent. Check your email and open the link within 15 minutes to continue.';
}
