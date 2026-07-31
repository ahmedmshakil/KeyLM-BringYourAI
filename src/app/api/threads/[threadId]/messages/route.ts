import { Provider } from '@prisma/client';
import { requireUser } from '@/lib/auth';
import { errorResponse, jsonResponse } from '@/lib/http';
import { recordAppEvent, withApiMetrics } from '@/lib/metrics';
import { messageCreateSchema } from '@/lib/validators';
import { getThreadForChat, appendMessage, findMessagesByRequestId } from '@/lib/services/threadService';
import { getActiveKey } from '@/lib/services/keyService';
import { decryptSecret } from '@/lib/crypto';
import { getProviderAdapter } from '@/lib/providers';
import { buildChatMessages } from '@/lib/services/chatService';
import { sseResponse } from '@/lib/streaming';
import { takeToken } from '@/lib/rateLimit';
import { prisma } from '@/lib/db';
import {
  FreeQuotaError,
  getFreeTierConfig,
  getSharedModel,
  getXiaomiConfig,
  releaseFreeRequest,
  reserveFreeRequest
} from '@/lib/freeTier';
import { toMessageDto } from '@/lib/services/threadDtos';
import { UsageInfo } from '@/lib/providers/types';
import { getRuntimeProvider } from '@/lib/services/threadRuntime';

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

type MessageParams = Promise<{ threadId: string }>;

export const POST = withApiMetrics(
  '/api/threads/[threadId]/messages',
  'POST',
  async (request: Request, { params }: { params: MessageParams }) => {
    const user = await requireUser();
    if (!user) {
      return errorResponse({ code: 'unauthorized', message: 'Unauthorized' }, 401);
    }
    const { threadId } = await params;

    // Parse body and fetch thread + rate limit in parallel (independent operations)
    let body: { content: string; requestId?: string; stream?: boolean };
    try {
      body = messageCreateSchema.parse(await request.json());
    } catch (error) {
      recordAppEvent('chat_message_request', 'invalid_request');
      return errorResponse({ code: 'invalid_request', message: 'Invalid request' }, 400);
    }

    const [thread, rateLimited] = await Promise.all([
      getThreadForChat(user.id, threadId),
      takeToken(`user:${user.id}`)
    ]);

    if (!thread) {
      return errorResponse({ code: 'not_found', message: 'Thread not found' }, 404);
    }
    if (!rateLimited) {
      recordAppEvent('chat_message_request', 'rate_limited');
      return errorResponse({ code: 'rate_limited', message: 'Too many requests', retryable: true }, 429);
    }

    recordAppEvent('chat_message_request', 'started');

    // Fetch existing messages once (used for both dedup and user-message check)
    const existingMessages = body.requestId
      ? await findMessagesByRequestId(thread.id, body.requestId)
      : [];

    const existingAssistant = existingMessages.find((message) => message.role === 'assistant');
    if (existingAssistant) {
      recordAppEvent('chat_message_request', 'success');
      return jsonResponse({ message: toMessageDto(existingAssistant) });
    }

    const runtimeProvider = getRuntimeProvider(thread);
    let rawKey = '';
    let runtimeModel = thread.model;
    let freeRequestReserved = false;
    if (runtimeProvider === 'groq' || runtimeProvider === 'xiaomi') {
      try {
        const sharedModel = getSharedModel(thread.model);
        if (runtimeProvider === 'xiaomi' && (!sharedModel || sharedModel.provider !== 'xiaomi' || !sharedModel.available)) {
          return errorResponse(
            { code: 'model_unavailable', message: 'This Xiaomi MiMo model is not configured right now.' },
            503
          );
        }

        if (runtimeProvider === 'xiaomi') {
          rawKey = getXiaomiConfig().apiKey;
          runtimeModel = sharedModel!.id;
        } else {
          const config = getFreeTierConfig();
          if (!config.apiKey) {
            return errorResponse(
              { code: 'model_unavailable', message: 'This Groq model is not configured right now.' },
              503
            );
          }
          rawKey = config.apiKey;
          // Preserve existing Groq threads by using the current Groq default if
          // their stored model is no longer in the shared catalog.
          runtimeModel = sharedModel?.provider === 'groq' ? sharedModel.id : config.model;
        }
        await reserveFreeRequest(user.id);
        freeRequestReserved = true;
      } catch (error) {
        if (error instanceof FreeQuotaError) {
          recordAppEvent('chat_message_request', 'limit_reached');
          return errorResponse({ code: error.code, message: error.message }, 403);
        }

        recordAppEvent('chat_message_request', 'disabled');
        return errorResponse(
          { code: 'free_unavailable', message: 'KeyLM shared catalog is not configured right now.' },
          503
        );
      }
    } else {
      const key = await getActiveKey(user.id, runtimeProvider as Provider);
      if (!key) {
        recordAppEvent('chat_message_request', 'key_missing');
        return errorResponse({ code: 'key_missing', message: 'Connect a key first' }, 400);
      }
      // Fire-and-forget: don't block the LLM call for this non-critical write
      prisma.providerKey.update({
        where: { id: key.id },
        data: { lastUsedAt: new Date() }
      }).catch(() => {});
      rawKey = decryptSecret(key.keyCiphertext);
    }

    const existingUserMessage = existingMessages.find((message) => message.role === 'user');
    const userMessage =
      existingUserMessage ??
      (await appendMessage(thread.id, 'user', body.content, body.requestId));
    if (!thread.title || !thread.title.trim()) {
      const firstUserMessage = [...thread.messages, userMessage].find(
        (message) => message.role === 'user' && message.content.trim()
      );
      if (firstUserMessage) {
        const title = buildThreadTitle(firstUserMessage.content);
        if (title) {
          // Fire-and-forget: do not block LLM start for title write
          prisma.thread
            .update({
              where: { id: thread.id },
              data: { title }
            })
            .catch(() => {});
        }
      }
    }

    const adapter = getProviderAdapter(runtimeProvider);
    const messages = buildChatMessages(thread, [...thread.messages, userMessage]);

    const settings = (thread.settings as { temperature?: number; maxTokens?: number }) ?? {};
    const buildMetadata = (usage?: UsageInfo) => (usage ? { usage } : undefined);

    // Enable streaming for all providers including Gemini
    const shouldStream = body.stream !== false;
    if (!shouldStream) {
      try {
        const result = await adapter.chat(rawKey, runtimeModel, messages, settings, request.signal);
        const assistant = await appendMessage(
          thread.id,
          'assistant',
          result.fullText,
          body.requestId,
          buildMetadata(result.usage)
        );
        recordAppEvent('chat_message_request', 'success');
        return jsonResponse({ message: toMessageDto(assistant) });
      } catch (error) {
        if (freeRequestReserved) {
          await releaseFreeRequest(user.id).catch(() => undefined);
        }
        recordAppEvent('chat_message_request', 'provider_error');
        return errorResponse(
          {
            code: 'provider_error',
            message: error instanceof Error ? error.message : 'Failed to send message'
          },
          502
        );
      }
    }

    return sseResponse(async (send, signal) => {
      let assistantStored = false;
      try {
        const abort = new AbortController();
        signal.addEventListener('abort', () => abort.abort());
        const stream = adapter.streamChat(rawKey, runtimeModel, messages, settings, abort.signal);
        let fullText = '';
        let usage: UsageInfo | undefined;

        while (true) {
          const next = await stream.next();
          if (next.done) {
            fullText = next.value.fullText;
            usage = next.value.usage;
            break;
          }

          fullText += next.value.delta;
          send('delta', { delta: next.value.delta });
        }
        const assistant = await appendMessage(
          thread.id,
          'assistant',
          fullText,
          body.requestId,
          buildMetadata(usage)
        );
        assistantStored = true;
        recordAppEvent('chat_message_request', 'success');
        send('done', { message: toMessageDto(assistant) });
      } catch (error) {
        if (freeRequestReserved && !assistantStored) {
          await releaseFreeRequest(user.id).catch(() => undefined);
        }
        recordAppEvent('chat_message_request', 'provider_error');
        const errorMessage = error instanceof Error ? error.message : 'An error occurred';
        send('error', { message: errorMessage });
      }
    }, request.signal);
  }
);
