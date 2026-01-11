import { Provider } from '@prisma/client';
import { requireUser } from '@/lib/auth';
import { errorResponse, jsonResponse } from '@/lib/http';
import { messageCreateSchema } from '@/lib/validators';
import { getThread, appendMessage, findMessageByRequestId } from '@/lib/services/threadService';
import { getActiveKey } from '@/lib/services/keyService';
import { decryptSecret } from '@/lib/crypto';
import { getProviderAdapter } from '@/lib/providers';
import { buildChatMessages } from '@/lib/services/chatService';
import { sseResponse } from '@/lib/streaming';
import { takeToken } from '@/lib/rateLimit';
import { prisma } from '@/lib/db';

const buildThreadTitle = (content: string) => {
  const cleaned = content.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return null;
  }
  const words = cleaned.split(' ');
  const limit = 4;
  const snippet = words.slice(0, limit).join(' ');
  return words.length > limit ? `${snippet}...` : snippet;
};

export async function POST(request: Request, { params }: { params: { threadId: string } }) {
  const user = await requireUser();
  if (!user) {
    return errorResponse({ code: 'unauthorized', message: 'Unauthorized' }, 401);
  }
  const thread = await getThread(user.id, params.threadId);
  if (!thread) {
    return errorResponse({ code: 'not_found', message: 'Thread not found' }, 404);
  }

  let body: { content: string; requestId?: string; stream?: boolean };
  try {
    body = messageCreateSchema.parse(await request.json());
  } catch (error) {
    return errorResponse({ code: 'invalid_request', message: 'Invalid request' }, 400);
  }

  if (!takeToken(`user:${user.id}`)) {
    return errorResponse({ code: 'rate_limited', message: 'Too many requests', retryable: true }, 429);
  }

  if (body.requestId) {
    const existing = await findMessageByRequestId(thread.id, body.requestId);
    if (existing) {
      return jsonResponse({ message: existing });
    }
  }

  const userMessage = await appendMessage(thread.id, 'user', body.content, body.requestId);
  if (!thread.title || !thread.title.trim()) {
    const firstUserMessage = [...thread.messages, userMessage].find(
      (message) => message.role === 'user' && message.content.trim()
    );
    if (firstUserMessage) {
      const title = buildThreadTitle(firstUserMessage.content);
      if (title) {
        await prisma.thread.update({
          where: { id: thread.id },
          data: { title }
        });
      }
    }
  }

  const key = await getActiveKey(user.id, thread.provider as Provider);
  if (!key) {
    return errorResponse({ code: 'key_missing', message: 'Connect a key first' }, 400);
  }
  await prisma.providerKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() }
  });

  const rawKey = decryptSecret(key.keyCiphertext);
  const adapter = getProviderAdapter(thread.provider as Provider);
  const messages = buildChatMessages(thread, thread.messages.concat(userMessage));

  const settings = (thread.settings as { temperature?: number; maxTokens?: number }) ?? {};

  // Enable streaming for all providers including Gemini
  const shouldStream = body.stream !== false;
  if (!shouldStream) {
    const result = await adapter.chat(rawKey, thread.model, messages, settings, request.signal);
    const assistant = await appendMessage(thread.id, 'assistant', result.fullText, body.requestId);
    return jsonResponse({ message: assistant });
  }

  return sseResponse(async (send, signal) => {
    try {
      const abort = new AbortController();
      signal.addEventListener('abort', () => abort.abort());
      const stream = adapter.streamChat(rawKey, thread.model, messages, settings, abort.signal);
      let fullText = '';
      for await (const chunk of stream) {
        fullText += chunk.delta;
        send('delta', { delta: chunk.delta });
      }
      const assistant = await appendMessage(thread.id, 'assistant', fullText, body.requestId);
      send('done', { message: assistant });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      send('error', { message: errorMessage });
    }
  }, request.signal);
}
