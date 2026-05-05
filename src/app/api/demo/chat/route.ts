import crypto from 'crypto';
import { cookies } from 'next/headers';
import { setDemoCookie } from '@/lib/cookies';
import { DEMO_COOKIE, DEMO_MESSAGE_LIMIT, buildDemoUsageSnapshot, signDemoSession } from '@/lib/demoSession';
import { getFreeTierConfig, isFreeTierConfigured } from '@/lib/freeTier';
import { getClientIp, jsonResponse } from '@/lib/http';
import { recordAppEvent, withApiMetrics } from '@/lib/metrics';
import { getProviderAdapter } from '@/lib/providers';
import { takeToken } from '@/lib/rateLimit';
import { demoChatSchema } from '@/lib/validators';

export const POST = withApiMetrics('/api/demo/chat', 'POST', async (request: Request) => {
  recordAppEvent('demo_chat_request', 'started');
  const config = getFreeTierConfig();
  const demoEnabled = isFreeTierConfigured();
  const cookieStore = await cookies();
  const currentToken = cookieStore.get(DEMO_COOKIE)?.value;
  const demo = buildDemoUsageSnapshot({
    enabled: demoEnabled,
    model: config.model,
    token: currentToken,
    limit: DEMO_MESSAGE_LIMIT
  });

  if (!demo.enabled) {
    recordAppEvent('demo_chat_request', 'disabled');
    return Response.json(
      {
        error: {
          code: 'demo_unavailable',
          message: 'KeyLM demo is unavailable right now. Please create an account and connect your own API key.'
        },
        demo
      },
      { status: 503 }
    );
  }

  if (!(await takeToken(`demo:${getClientIp(request)}`, 20, 60_000))) {
    recordAppEvent('demo_chat_request', 'rate_limited');
    return Response.json(
      {
        error: {
          code: 'rate_limited',
          message: 'Too many demo requests. Please wait a moment and try again.',
          retryable: true
        },
        demo
      },
      { status: 429 }
    );
  }

  let body: { messages: Array<{ role: 'user' | 'assistant'; content: string }> };
  try {
    body = demoChatSchema.parse(await request.json());
  } catch {
    recordAppEvent('demo_chat_request', 'invalid_request');
    return Response.json(
      {
        error: { code: 'invalid_request', message: 'Invalid demo request.' },
        demo
      },
      { status: 400 }
    );
  }

  const lastMessage = body.messages.at(-1);
  if (!lastMessage || lastMessage.role !== 'user') {
    recordAppEvent('demo_chat_request', 'invalid_request');
    return Response.json(
      {
        error: { code: 'invalid_request', message: 'The last demo message must come from the user.' },
        demo
      },
      { status: 400 }
    );
  }

  if (demo.exhausted) {
    recordAppEvent('demo_chat_request', 'limit_reached');
    return Response.json(
      {
        error: {
          code: 'demo_limit_reached',
          message: 'Your 3-message demo is complete. Log in or create an account to continue.'
        },
        demo
      },
      { status: 403 }
    );
  }

  try {
    const adapter = getProviderAdapter('groq');
    const result = await adapter.chat(config.apiKey, config.model, body.messages, {}, request.signal);
    const nextToken = signDemoSession(demo.used + 1, demo.limit);
    await setDemoCookie(nextToken);

    recordAppEvent('demo_chat_request', 'success');
    return jsonResponse({
      message: {
        id: `demo-${crypto.randomUUID()}`,
        role: 'assistant' as const,
        content: result.fullText,
        createdAt: new Date().toISOString(),
        usage: result.usage
      },
      demo: buildDemoUsageSnapshot({
        enabled: true,
        model: config.model,
        token: nextToken,
        limit: demo.limit
      })
    });
  } catch (error) {
    recordAppEvent('demo_chat_request', 'provider_error');
    return Response.json(
      {
        error: {
          code: 'provider_error',
          message: error instanceof Error ? error.message : 'Failed to generate a demo response.'
        },
        demo
      },
      { status: 502 }
    );
  }
});
