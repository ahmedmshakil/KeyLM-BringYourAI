import { Provider } from '@prisma/client';
import { requireUser } from '@/lib/auth';
import { threadCreateSchema } from '@/lib/validators';
import { createThread, listThreads } from '@/lib/services/threadService';
import { getActiveKey } from '@/lib/services/keyService';
import { getFreeTierConfig, getFreeUsageStatus, isValidFreeModel } from '@/lib/freeTier';
import { errorResponse, jsonResponse } from '@/lib/http';
import { recordAppEvent, withApiMetrics } from '@/lib/metrics';
import { toThreadDetailDto } from '@/lib/services/threadDtos';
import { buildThreadSettings, getRuntimeProvider } from '@/lib/services/threadRuntime';

export const POST = withApiMetrics('/api/threads', 'POST', async (request: Request) => {
  const user = await requireUser();
  if (!user) {
    return errorResponse({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  }
  recordAppEvent('thread_create', 'started');

  try {
    const body = threadCreateSchema.parse(await request.json());
    if (body.mode === 'free') {
      const status = await getFreeUsageStatus(user.id);
      if (status.status === 'disabled') {
        recordAppEvent('thread_create', 'disabled');
        return errorResponse(
          { code: 'free_unavailable', message: 'KeyLM free mode is not configured right now.' },
          503
        );
      }
      if (status.status === 'global_exhausted') {
        recordAppEvent('thread_create', 'limit_reached');
        return errorResponse(
          {
            code: 'free_global_limit_reached',
            message: 'No global free API requests are left today. Connect your own API key to continue.'
          },
          403
        );
      }
      if (status.status === 'user_exhausted') {
        recordAppEvent('thread_create', 'limit_reached');
        return errorResponse(
          {
            code: 'free_user_limit_reached',
            message: 'Your free daily request limit is over. Connect your own API key to continue chatting.'
          },
          403
        );
      }

      const config = getFreeTierConfig();
      const chosenModel = body.model && isValidFreeModel(body.model) ? body.model : config.model;
      const thread = await createThread(
        user.id,
        'groq' as Provider,
        chosenModel,
        body.systemPrompt,
        buildThreadSettings(body.settings, 'groq')
      );
      recordAppEvent('thread_create', 'success');
      return jsonResponse({ thread: toThreadDetailDto({ ...thread, messages: [] }) }, { status: 201 });
    }

    const key = await getActiveKey(user.id, body.provider as Provider);
    if (!key) {
      recordAppEvent('thread_create', 'key_missing');
      return errorResponse({ code: 'key_missing', message: 'Connect a key first' }, 400);
    }
    const thread = await createThread(
      user.id,
      body.provider as Provider,
      body.model,
      body.systemPrompt,
      buildThreadSettings(body.settings, body.provider)
    );
    recordAppEvent('thread_create', 'success');
    return jsonResponse({ thread: toThreadDetailDto({ ...thread, messages: [] }) }, { status: 201 });
  } catch (error) {
    recordAppEvent('thread_create', 'invalid_request');
    return errorResponse({ code: 'invalid_request', message: 'Invalid request' }, 400);
  }
});

export const GET = withApiMetrics('/api/threads', 'GET', async () => {
  const user = await requireUser();
  if (!user) {
    return errorResponse({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  }
  const threads = await listThreads(user.id);
  return jsonResponse({
    threads: threads.map((thread) => ({
      id: thread.id,
      provider: getRuntimeProvider(thread),
      model: thread.model,
      title: thread.title,
      status: thread.status,
      updatedAt: thread.updatedAt,
      lastMessage: thread.messages[0]?.content ?? null
    }))
  });
});
