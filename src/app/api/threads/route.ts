import { Provider } from '@prisma/client';
import { requireUser } from '@/lib/auth';
import { threadCreateSchema } from '@/lib/validators';
import { createThread, listThreads } from '@/lib/services/threadService';
import { getActiveKey } from '@/lib/services/keyService';
import { errorResponse, jsonResponse } from '@/lib/http';

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) {
    return errorResponse({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  }
  try {
    const body = threadCreateSchema.parse(await request.json());
    const key = await getActiveKey(user.id, body.provider as Provider);
    if (!key) {
      return errorResponse({ code: 'key_missing', message: 'Connect a key first' }, 400);
    }
    const thread = await createThread(
      user.id,
      body.provider as Provider,
      body.model,
      body.systemPrompt,
      body.settings
    );
    return jsonResponse({ thread }, { status: 201 });
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
      provider: thread.provider,
      model: thread.model,
      title: thread.title,
      status: thread.status,
      updatedAt: thread.updatedAt,
      lastMessage: thread.messages[0]?.content ?? null
    }))
  });
}
