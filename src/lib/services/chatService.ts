import { ChatMessage } from '@/lib/providers/types';
import { Thread, Message } from '@prisma/client';

export function buildChatMessages(thread: Thread, messages: Message[]): ChatMessage[] {
  const output: ChatMessage[] = [];
  if (thread.systemPrompt) {
    output.push({ role: 'system', content: thread.systemPrompt });
  }
  for (const msg of messages) {
    if (msg.role === 'system') {
      continue;
    }
    output.push({ role: msg.role as ChatMessage['role'], content: msg.content });
  }
  return output;
}
