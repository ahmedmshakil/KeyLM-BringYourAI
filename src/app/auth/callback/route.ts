import { type EmailOtpType } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createAppSessionForSupabaseUser, createSupabasePasswordlessServerClient } from '@/lib/passwordlessAuth';

const EMAIL_OTP_TYPES = new Set<EmailOtpType>(['email', 'magiclink', 'signup', 'invite']);

function buildAppRedirect(request: Request, params?: Record<string, string>) {
  const redirectUrl = new URL('/app', request.url);
  for (const [key, value] of Object.entries(params ?? {})) {
    redirectUrl.searchParams.set(key, value);
  }
  return redirectUrl;
}

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return Boolean(value && EMAIL_OTP_TYPES.has(value as EmailOtpType));
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');

  try {
    const supabase = await createSupabasePasswordlessServerClient();

    if (tokenHash && isEmailOtpType(type)) {
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type
      });

      if (error || !data.user) {
        throw new Error(error?.message || 'Magic link is invalid or expired.');
      }

      await createAppSessionForSupabaseUser(data.user);
      return NextResponse.redirect(buildAppRedirect(request));
    }

    if (code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error || !data.user) {
        throw new Error(error?.message || 'Magic link is invalid or expired.');
      }

      await createAppSessionForSupabaseUser(data.user);
      return NextResponse.redirect(buildAppRedirect(request));
    }

    throw new Error('Missing passwordless verification token.');
  } catch {
    return NextResponse.redirect(
      buildAppRedirect(request, {
        auth: 'login',
        auth_error: 'passwordless_callback_failed'
      })
    );
  }
}