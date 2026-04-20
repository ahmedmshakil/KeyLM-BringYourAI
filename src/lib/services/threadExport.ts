import { Message, Thread } from '@prisma/client';
import { UsageInfo } from '@/lib/providers/types';
import { getPublicThreadSettings, getRuntimeProvider } from '@/lib/services/threadRuntime';

type MessageMetadata = {
  usage?: UsageInfo;
};

export type ThreadExportMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  usage?: UsageInfo;
};

export type ThreadExportData = {
  id: string;
  title: string;
  provider: string;
  model: string;
  systemPrompt: string | null;
  settings: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  exportedAt: string;
  messageCount: number;
  messages: ThreadExportMessage[];
};

function getMessageUsage(message: Message) {
  const metadata = message.metadata as MessageMetadata | null;
  return metadata?.usage;
}

function truncateWords(value: string, limit: number) {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return '';
  }

  const words = cleaned.split(' ');
  const snippet = words.slice(0, limit).join(' ');
  return words.length > limit ? `${snippet}...` : snippet;
}

function deriveThreadTitle(thread: Thread & { messages: Message[] }) {
  if (thread.title?.trim()) {
    return thread.title.trim();
  }

  const firstUserMessage = thread.messages.find((message) => message.role === 'user' && message.content.trim());
  if (firstUserMessage) {
    return truncateWords(firstUserMessage.content, 4) || 'New thread';
  }

  return `Thread ${thread.id.slice(0, 8)}`;
}

function sanitizeFilenameSegment(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return normalized || 'thread-export';
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatRole(role: string) {
  if (role === 'user') {
    return 'User';
  }

  if (role === 'assistant') {
    return 'Assistant';
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function buildThreadExportData(thread: Thread & { messages: Message[] }): ThreadExportData {
  const messages = thread.messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    usage: getMessageUsage(message)
  }));

  return {
    id: thread.id,
    title: deriveThreadTitle(thread),
    provider: getRuntimeProvider(thread),
    model: thread.model,
    systemPrompt: thread.systemPrompt,
    settings: getPublicThreadSettings(thread.settings) as Record<string, unknown> | null,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    exportedAt: new Date().toISOString(),
    messageCount: messages.length,
    messages
  };
}

export function buildExportFilename(data: ThreadExportData, format: 'json' | 'pdf') {
  const base = `${sanitizeFilenameSegment(data.title)}-${data.id.slice(0, 8)}`;

  if (format === 'json') {
    return `${base}.json`;
  }

  return `${base}.html`;
}

export function renderThreadJson(data: ThreadExportData) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function renderThreadPrintHtml(data: ThreadExportData) {
  const messagesBlock =
    data.messages.length > 0
      ? data.messages
          .map((message) => {
            return `<article class="message ${escapeHtml(message.role)}">
              <div class="message-role">${escapeHtml(formatRole(message.role))}</div>
              <div class="message-copy">${escapeHtml(message.content || 'Empty message')}</div>
            </article>`;
          })
          .join('')
      : '<p class="empty-state">No messages yet.</p>';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title></title>
    <style>
      :root {
        color-scheme: light;
        --bg: #ffffff;
        --surface: #ffffff;
        --surface-2: #fff7ee;
        --border: #e3d4c4;
        --ink: #241c14;
        --muted: #6a5d52;
        --assistant: #eef7f5;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        font-family: Inter, system-ui, sans-serif;
        background: var(--bg);
        color: var(--ink);
        line-height: 1.55;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }

      .page {
        max-width: 860px;
        margin: 0 auto;
        padding: 20px 18px 28px;
      }

      .message {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 18px;
        box-shadow: none;
        break-inside: avoid;
      }

      .messages {
        display: grid;
        gap: 14px;
      }

      .message {
        padding: 18px 20px;
      }

      .message.user {
        background: #fff8f2;
        border-color: #f0d0b5;
      }

      .message.assistant {
        background: var(--assistant);
      }

      .message-role {
        display: inline-flex;
        align-items: center;
        margin-bottom: 10px;
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--muted);
      }

      .message-copy {
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 0.98rem;
      }

      .empty-state {
        color: var(--muted);
        font-size: 0.95rem;
      }

      @page {
        margin: 14mm;
      }

      @media print {
        body {
          background: #fff;
        }

        .page {
          max-width: none;
          padding: 0;
        }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="messages">${messagesBlock}</section>
    </main>
  </body>
</html>`;
}