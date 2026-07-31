'use client';

import { memo } from 'react';
import dynamic from 'next/dynamic';
import remarkGfm from 'remark-gfm';

const ReactMarkdown = dynamic(() => import('react-markdown'), {
  ssr: false,
  loading: () => null
});

export type MessageBubbleUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type MessageBubbleData = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  usage?: MessageBubbleUsage;
};

type MessageBubbleProps = {
  message: MessageBubbleData;
  isStreaming?: boolean;
  usageParts?: string[];
};

function MessageBubbleComponent({ message, isStreaming = false, usageParts = [] }: MessageBubbleProps) {
  return (
    <div className={`chat-bubble ${message.role}`}>
      {isStreaming ? (
        <div className="chat-bubble-plain">{message.content}</div>
      ) : (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
      )}
      {message.role === 'assistant' && usageParts.length > 0 && (
        <div className="message-usage">
          {usageParts.map((part) => (
            <span key={`${message.id}-${part}`}>{part}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleComponent);
