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

const loginSchema = z.object({
  email: authEmailSchema,
  method: passwordlessMethodSchema.default('magic_link'),
  captchaToken: authCaptchaTokenSchema
});

const LOGIN_RATE_LIMIT = 10;
const AUTH_WINDOW_MS = 15 * 60_000;

export const POST = withApiMetrics('/api/auth/login', 'POST', async (request: Request) => {
  recordAuthEvent('login_request', 'started');

  try {
    const body = loginSchema.parse(await request.json());
    const email = normalizeEmail(body.email);
    const clientIp = getClientIp(request);
    const allowed = await takeToken(`auth:login:${clientIp}:${email}`, LOGIN_RATE_LIMIT, AUTH_WINDOW_MS);

    if (!allowed) {
      recordAuthEvent('login_request', 'rate_limited');
      return errorResponse({ code: 'rate_limited', message: 'Too many login attempts. Try again soon.' }, 429);
    }

    await sendPasswordlessEmail({
      email,
      captchaToken: body.captchaToken.trim(),
      method: body.method,
      intent: 'login',
      request
    });

    recordAuthEvent('login_request', 'success');
    return jsonResponse({
      ok: true,
      method: body.method,
      message: getPasswordlessSuccessMessage(body.method)
    });
  } catch (error) {
    recordAuthEvent('login_request', 'failure');

    if (error instanceof PasswordlessAuthError) {
      return errorResponse({ code: error.code, message: error.message }, error.status);
    }

    return errorResponse({ code: 'captcha_required', message: 'Captcha verification required' }, 400);
  }
});
