import { Message, Thread } from '@prisma/client';
import { UsageInfo } from '@/lib/providers/types';
import { getPublicThreadSettings, getRuntimeProvider } from '@/lib/services/threadRuntime';

type MessageMetadata = {
  usage?: UsageInfo;
};

function getMessageUsage(message: Message) {
  const metadata = message.metadata as MessageMetadata | null;
  return metadata?.usage;
}

export function toMessageDto(message: Message) {
  return {
    id: message.id,
    role: message.role as 'user' | 'assistant',
    content: message.content,
    createdAt: message.createdAt,
    usage: getMessageUsage(message)
  };
}

export function toThreadDetailDto(thread: Thread & { messages: Message[] }) {
  return {
    id: thread.id,
    provider: getRuntimeProvider(thread),
    model: thread.model,
    systemPrompt: thread.systemPrompt,
    settings: getPublicThreadSettings(thread.settings),
    messages: thread.messages.map(toMessageDto)
  };
}
