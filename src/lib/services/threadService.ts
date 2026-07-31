import { Provider, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { withDatabaseMetrics } from '@/lib/metrics';

/** Max messages sent as LLM context on each chat turn. */
export const CHAT_CONTEXT_MESSAGE_LIMIT = 40;
/** Max characters kept for thread sidebar previews. */
export const THREAD_PREVIEW_MAX_CHARS = 120;
/** Cap threads returned on list/bootstrap to bound payload size. */
export const THREAD_LIST_LIMIT = 50;

const MESSAGE_SELECT = {
  id: true,
  role: true,
  content: true,
  createdAt: true,
  clientRequestId: true,
  metadata: true
} as const;

function truncatePreview(content: string | null | undefined, maxChars = THREAD_PREVIEW_MAX_CHARS) {
  if (!content) {
    return null;
  }
  const cleaned = content.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return null;
  }
  if (cleaned.length <= maxChars) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxChars - 1).trimEnd()}…`;
}

export async function createThread(
  userId: string,
  provider: Provider,
  model: string,
  systemPrompt?: string,
  settings?: Record<string, unknown>
) {
  return withDatabaseMetrics('thread.create', () =>
    prisma.thread.create({
      data: {
        userId,
        provider,
        model,
        systemPrompt: systemPrompt || null,
        settings: settings ? (settings as Prisma.InputJsonValue) : undefined
      }
    })
  );
}

export async function listThreads(userId: string, options?: { limit?: number }) {
  const limit = options?.limit ?? THREAD_LIST_LIMIT;
  const threads = await withDatabaseMetrics('thread.list', () =>
    prisma.thread.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true }
        }
      }
    })
  );

  return threads.map((thread) => ({
    ...thread,
    messages: thread.messages.map((message) => ({
      ...message,
      content: truncatePreview(message.content) ?? ''
    }))
  }));
}

export async function getThread(userId: string, threadId: string) {
  return withDatabaseMetrics('thread.get', () =>
    prisma.thread.findFirst({
      where: { id: threadId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } }
    })
  );
}

/**
 * Lean thread load for chat POST: metadata + last N messages only.
 * Avoids unbounded history DB I/O and LLM context growth.
 */
export async function getThreadForChat(
  userId: string,
  threadId: string,
  maxMessages = CHAT_CONTEXT_MESSAGE_LIMIT
) {
  return withDatabaseMetrics('thread.get_for_chat', async () => {
    const thread = await prisma.thread.findFirst({
      where: { id: threadId, userId },
      select: {
        id: true,
        userId: true,
        provider: true,
        model: true,
        title: true,
        status: true,
        systemPrompt: true,
        settings: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          orderBy: { createdAt: 'desc' },
          take: maxMessages,
          select: MESSAGE_SELECT
        }
      }
    });

    if (!thread) {
      return null;
    }

    return {
      ...thread,
      messages: [...thread.messages].reverse()
    };
  });
}

export async function deleteThread(userId: string, threadId: string) {
  return withDatabaseMetrics('thread.delete', async () => {
    const thread = await prisma.thread.findFirst({ where: { id: threadId, userId } });
    if (!thread) {
      throw new Error('Thread not found');
    }
    await prisma.message.deleteMany({ where: { threadId } });
    await prisma.thread.delete({ where: { id: thread.id } });
    return thread;
  });
}

export async function appendMessage(
  threadId: string,
  role: string,
  content: string,
  clientRequestId?: string,
  metadata?: Record<string, unknown>
) {
  try {
    return await withDatabaseMetrics('message.create', () =>
      prisma.message.create({
        data: {
          threadId,
          role,
          content,
          clientRequestId,
          metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined
        }
      })
    );
  } catch (error) {
    if (
      clientRequestId &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const existing = await withDatabaseMetrics('message.find_duplicate', () =>
        prisma.message.findFirst({
          where: {
            threadId,
            clientRequestId,
            role
          }
        })
      );
      if (existing) {
        return existing;
      }
    }

    throw error;
  }
}

export async function findMessageByRequestId(threadId: string, requestId: string) {
  return withDatabaseMetrics('message.find_by_request_id', () =>
    prisma.message.findFirst({ where: { threadId, clientRequestId: requestId, role: 'assistant' } })
  );
}

export async function findMessagesByRequestId(threadId: string, requestId: string) {
  return withDatabaseMetrics('message.find_many_by_request_id', () =>
    prisma.message.findMany({
      where: { threadId, clientRequestId: requestId },
      orderBy: { createdAt: 'asc' }
    })
  );
}
