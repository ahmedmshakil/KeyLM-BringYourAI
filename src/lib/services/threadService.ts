import { Provider, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { withDatabaseMetrics } from '@/lib/metrics';

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

export async function listThreads(userId: string) {
  return withDatabaseMetrics('thread.list', () =>
    prisma.thread.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } }
    })
  );
}

export async function getThread(userId: string, threadId: string) {
  return withDatabaseMetrics('thread.get', () =>
    prisma.thread.findFirst({
      where: { id: threadId, userId },
      include: { messages: { orderBy: { createdAt: 'asc' } } }
    })
  );
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
