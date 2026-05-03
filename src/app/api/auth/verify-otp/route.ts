import { z } from 'zod';
import { createAppSessionForSupabaseUser, createSupabasePasswordlessClient, PasswordlessAuthError } from '@/lib/passwordlessAuth';
import { takeToken } from '@/lib/rateLimit';
import { authEmailSchema, authOtpTokenSchema, normalizeEmail } from '@/lib/validators';
import { errorResponse, getClientIp, jsonResponse } from '@/lib/http';

const verifyOtpSchema = z.object({
  email: authEmailSchema,
  token: authOtpTokenSchema
});

const OTP_VERIFY_RATE_LIMIT = 10;
const AUTH_WINDOW_MS = 15 * 60_000;

export async function POST(request: Request) {
  try {
    const body = verifyOtpSchema.parse(await request.json());
    const email = normalizeEmail(body.email);
    const clientIp = getClientIp(request);
    const allowed = await takeToken(`auth:verify-otp:${clientIp}:${email}`, OTP_VERIFY_RATE_LIMIT, AUTH_WINDOW_MS);

    if (!allowed) {
      return errorResponse({ code: 'rate_limited', message: 'Too many OTP attempts. Try again soon.' }, 429);
    }

    const supabase = createSupabasePasswordlessClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: body.token.trim(),
      type: 'email'
    });

    if (error || !data.user) {
      return errorResponse(
        { code: 'invalid_otp', message: error?.message || 'OTP is invalid or expired.' },
        400
      );
    }

    const user = await createAppSessionForSupabaseUser(data.user);
    return jsonResponse({ user });
  } catch (error) {
    if (error instanceof PasswordlessAuthError) {
      return errorResponse({ code: error.code, message: error.message }, error.status);
    }

    return errorResponse({ code: 'invalid_request', message: 'Invalid request' }, 400);
  }
}