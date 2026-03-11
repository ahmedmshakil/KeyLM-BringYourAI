import { requireUser } from '@/lib/auth';
import { deleteThread, getThread } from '@/lib/services/threadService';
import { errorResponse, jsonResponse } from '@/lib/http';
import { toThreadDetailDto } from '@/lib/services/threadDtos';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const user = await requireUser();
  if (!user) {
    return errorResponse({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  }
  const { threadId } = await params;
  const thread = await getThread(user.id, threadId);
  if (!thread) {
    return errorResponse({ code: 'not_found', message: 'Thread not found' }, 404);
  }
  return jsonResponse({ thread: toThreadDetailDto(thread) });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const user = await requireUser();
  if (!user) {
    return errorResponse({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  }
  try {
    const { threadId } = await params;
    await deleteThread(user.id, threadId);
    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse({ code: 'not_found', message: 'Thread not found' }, 404);
  }
}
