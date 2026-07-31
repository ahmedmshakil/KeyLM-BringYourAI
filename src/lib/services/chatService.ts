import { ChatMessage } from '@/lib/providers/types';

type ThreadWithSystemPrompt = {
  systemPrompt?: string | null;
};

type MessageLike = {
  role: string;
  content: string;
};

export function buildChatMessages(thread: ThreadWithSystemPrompt, messages: MessageLike[]): ChatMessage[] {
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
