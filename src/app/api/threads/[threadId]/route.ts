import { requireUser } from '@/lib/auth';
import { deleteThread, getThread } from '@/lib/services/threadService';
import { errorResponse, jsonResponse } from '@/lib/http';

export async function GET(request: Request, { params }: { params: { threadId: string } }) {
  const user = await requireUser();
  if (!user) {
    return errorResponse({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  }
  const thread = await getThread(user.id, params.threadId);
  if (!thread) {
    return errorResponse({ code: 'not_found', message: 'Thread not found' }, 404);
  }
  return jsonResponse({ thread });
}

export async function DELETE(request: Request, { params }: { params: { threadId: string } }) {
  const user = await requireUser();
  if (!user) {
    return errorResponse({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  }
  try {
    await deleteThread(user.id, params.threadId);
    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse({ code: 'not_found', message: 'Thread not found' }, 404);
  }
}
