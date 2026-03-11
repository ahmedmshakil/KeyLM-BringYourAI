import { Provider } from '@prisma/client';
import { requireUser } from '@/lib/auth';
import { threadCreateSchema } from '@/lib/validators';
import { createThread, listThreads } from '@/lib/services/threadService';
import { getActiveKey } from '@/lib/services/keyService';
import { getFreeTierConfig, getFreeUsageStatus } from '@/lib/freeTier';
import { errorResponse, jsonResponse } from '@/lib/http';
import { toThreadDetailDto } from '@/lib/services/threadDtos';
import { buildThreadSettings, getRuntimeProvider } from '@/lib/services/threadRuntime';

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) {
    return errorResponse({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  }
  try {
    const body = threadCreateSchema.parse(await request.json());
    if (body.mode === 'free') {
      const status = await getFreeUsageStatus(user.id);
      if (status.status === 'disabled') {
        return errorResponse(
          { code: 'free_unavailable', message: 'KeyLM free mode is not configured right now.' },
          503
        );
      }
      if (status.status === 'global_exhausted') {
        return errorResponse(
          {
            code: 'free_global_limit_reached',
            message: 'No global free API requests are left today. Connect your own API key to continue.'
          },
          403
        );
      }
      if (status.status === 'user_exhausted') {
        return errorResponse(
          {
            code: 'free_user_limit_reached',
            message: 'Your free daily request limit is over. Connect your own API key to continue chatting.'
          },
          403
        );
      }

      const config = getFreeTierConfig();
      const thread = await createThread(
        user.id,
        'openai' as Provider,
        config.model,
        body.systemPrompt,
        buildThreadSettings(body.settings, 'groq')
      );
      return jsonResponse({ thread: toThreadDetailDto({ ...thread, messages: [] }) }, { status: 201 });
    }

    const key = await getActiveKey(user.id, body.provider as Provider);
    if (!key) {
      return errorResponse({ code: 'key_missing', message: 'Connect a key first' }, 400);
    }
    const thread = await createThread(
      user.id,
      body.provider as Provider,
      body.model,
      body.systemPrompt,
      buildThreadSettings(body.settings, body.provider)
    );
    return jsonResponse({ thread: toThreadDetailDto({ ...thread, messages: [] }) }, { status: 201 });
  } catch (error) {
    return errorResponse({ code: 'invalid_request', message: 'Invalid request' }, 400);
  }
}

export async function GET() {
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
}
