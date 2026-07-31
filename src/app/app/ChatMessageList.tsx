'use client';

import { memo, useMemo, type ReactNode } from 'react';
import { MessageBubble, type MessageBubbleData, type MessageBubbleUsage } from './MessageBubble';

type ChatMessageListProps = {
  messages: MessageBubbleData[];
  streamingMessageId?: string | null;
  formatUsageParts: (usage?: MessageBubbleUsage) => string[];
  emptyState: ReactNode;
};

function ChatMessageListComponent({
  messages,
  streamingMessageId = null,
  formatUsageParts,
  emptyState
}: ChatMessageListProps) {
  const items = useMemo(
    () =>
      messages.map((msg) => ({
        msg,
        isStreaming: Boolean(streamingMessageId && msg.id === streamingMessageId),
        usageParts: formatUsageParts(msg.usage)
      })),
    [messages, streamingMessageId, formatUsageParts]
  );

  return (
    <div className="chat-messages">
      {messages.length === 0 && emptyState}
      {items.map(({ msg, isStreaming, usageParts }) => (
        <MessageBubble key={msg.id} message={msg} isStreaming={isStreaming} usageParts={usageParts} />
      ))}
    </div>
  );
}

export const ChatMessageList = memo(ChatMessageListComponent);
