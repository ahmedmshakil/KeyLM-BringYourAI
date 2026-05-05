import { z } from 'zod';
import { errorResponse, getClientIp, jsonResponse } from '@/lib/http';
import {
  getPasswordlessSuccessMessage,
  PasswordlessAuthError,
  sendPasswordlessEmail
} from '@/lib/passwordlessAuth';
import { takeToken } from '@/lib/rateLimit';
import { authCaptchaTokenSchema, authEmailSchema, normalizeEmail, passwordlessMethodSchema } from '@/lib/validators';
import { recordAuthEvent, withApiMetrics } from '@/lib/metrics';

const registerSchema = z.object({
  email: authEmailSchema,
  method: passwordlessMethodSchema.default('magic_link'),
  captchaToken: authCaptchaTokenSchema
});

const REGISTER_RATE_LIMIT = 5;
const AUTH_WINDOW_MS = 15 * 60_000;

export const POST = withApiMetrics('/api/auth/register', 'POST', async (request: Request) => {
  recordAuthEvent('register_request', 'started');

  try {
    const body = registerSchema.parse(await request.json());
    const email = normalizeEmail(body.email);
    const clientIp = getClientIp(request);
    const allowed = await takeToken(`auth:register:${clientIp}:${email}`, REGISTER_RATE_LIMIT, AUTH_WINDOW_MS);

    if (!allowed) {
      recordAuthEvent('register_request', 'rate_limited');
      return errorResponse({ code: 'rate_limited', message: 'Too many registration attempts. Try again soon.' }, 429);
    }

    await sendPasswordlessEmail({
      email,
      captchaToken: body.captchaToken.trim(),
      method: body.method,
      intent: 'register',
      request
    });

    recordAuthEvent('register_request', 'success');
    return jsonResponse(
      {
        ok: true,
        method: body.method,
        message: getPasswordlessSuccessMessage(body.method)
      },
      { status: 202 }
    );
  } catch (error) {
    recordAuthEvent('register_request', 'failure');

    if (error instanceof PasswordlessAuthError) {
      return errorResponse({ code: error.code, message: error.message }, error.status);
    }

    return errorResponse({ code: 'captcha_required', message: 'Captcha verification required' }, 400);
  }
});
