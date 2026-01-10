import { Provider } from '@prisma/client';
import { prisma } from '@/lib/db';

export async function createThread(
  userId: string,
  provider: Provider,
  model: string,
  systemPrompt?: string,
  settings?: Record<string, unknown>
) {
  return prisma.thread.create({
    data: {
      userId,
      provider,
      model,
      systemPrompt: systemPrompt || null,
      settings: settings ?? undefined
    }
  });
}

export async function listThreads(userId: string) {
  return prisma.thread.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } }
  });
}

export async function getThread(userId: string, threadId: string) {
  return prisma.thread.findFirst({
    where: { id: threadId, userId },
    include: { messages: { orderBy: { createdAt: 'asc' } } }
  });
}

export async function deleteThread(userId: string, threadId: string) {
  const thread = await prisma.thread.findFirst({ where: { id: threadId, userId } });
  if (!thread) {
    throw new Error('Thread not found');
  }
  await prisma.message.deleteMany({ where: { threadId } });
  await prisma.thread.delete({ where: { id: thread.id } });
  return thread;
}

export async function appendMessage(
  threadId: string,
  role: string,
  content: string,
  clientRequestId?: string,
  metadata?: Record<string, unknown>
) {
  return prisma.message.create({
    data: {
      threadId,
      role,
      content,
      clientRequestId,
      metadata
    }
  });
}

export async function findMessageByRequestId(threadId: string, requestId: string) {
  return prisma.message.findFirst({ where: { threadId, clientRequestId: requestId, role: 'assistant' } });
}
