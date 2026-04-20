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

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toISOString().replace('.000Z', ' UTC');
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

function formatUsageInline(usage?: UsageInfo) {
  if (!usage) {
    return null;
  }

  const parts: string[] = [];
  if (typeof usage.promptTokens === 'number') {
    parts.push(`input ${usage.promptTokens}`);
  }
  if (typeof usage.completionTokens === 'number') {
    parts.push(`output ${usage.completionTokens}`);
  }
  if (typeof usage.totalTokens === 'number') {
    parts.push(`total ${usage.totalTokens}`);
  }

  return parts.length > 0 ? parts.join(' · ') : null;
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

export function buildExportFilename(data: ThreadExportData, format: 'markdown' | 'json' | 'pdf') {
  const base = `${sanitizeFilenameSegment(data.title)}-${data.id.slice(0, 8)}`;

  if (format === 'markdown') {
    return `${base}.md`;
  }

  if (format === 'json') {
    return `${base}.json`;
  }

  return `${base}.html`;
}

export function renderThreadMarkdown(data: ThreadExportData) {
  const parts: string[] = [];

  parts.push(`# ${data.title}`);
  parts.push('');
  parts.push(`- Thread ID: ${data.id}`);
  parts.push(`- Provider: ${data.provider}`);
  parts.push(`- Model: ${data.model}`);
  parts.push(`- Created At: ${formatTimestamp(data.createdAt)}`);
  parts.push(`- Updated At: ${formatTimestamp(data.updatedAt)}`);
  parts.push(`- Exported At: ${formatTimestamp(data.exportedAt)}`);
  parts.push(`- Message Count: ${data.messageCount}`);
  parts.push('');

  if (data.systemPrompt) {
    parts.push('## System Prompt');
    parts.push('');
    parts.push(data.systemPrompt);
    parts.push('');
  }

  if (data.settings) {
    parts.push('## Settings');
    parts.push('');
    parts.push('```json');
    parts.push(JSON.stringify(data.settings, null, 2));
    parts.push('```');
    parts.push('');
  }

  parts.push('## Messages');
  parts.push('');

  if (data.messages.length === 0) {
    parts.push('_No messages yet._');
    parts.push('');
    return parts.join('\n');
  }

  for (const message of data.messages) {
    parts.push(`### ${formatRole(message.role)} · ${formatTimestamp(message.createdAt)}`);
    parts.push('');
    parts.push(message.content || '_Empty message_');

    const usageLine = formatUsageInline(message.usage);
    if (usageLine) {
      parts.push('');
      parts.push(`_Usage: ${usageLine}_`);
    }

    parts.push('');
  }

  return parts.join('\n');
}

export function renderThreadJson(data: ThreadExportData) {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function renderThreadPrintHtml(data: ThreadExportData) {
  const settingsBlock = data.settings
    ? `<section class="meta-card"><h2>Settings</h2><pre>${escapeHtml(JSON.stringify(data.settings, null, 2))}</pre></section>`
    : '';
  const systemPromptBlock = data.systemPrompt
    ? `<section class="meta-card"><h2>System Prompt</h2><div class="message-copy">${escapeHtml(data.systemPrompt)}</div></section>`
    : '';
  const messagesBlock =
    data.messages.length > 0
      ? data.messages
          .map((message) => {
            const usageLine = formatUsageInline(message.usage);
            return `<article class="message ${escapeHtml(message.role)}">
              <div class="message-head">
                <strong>${escapeHtml(formatRole(message.role))}</strong>
                <span>${escapeHtml(formatTimestamp(message.createdAt))}</span>
              </div>
              <div class="message-copy">${escapeHtml(message.content || 'Empty message')}</div>
              ${usageLine ? `<div class="usage">Usage: ${escapeHtml(usageLine)}</div>` : ''}
            </article>`;
          })
          .join('')
      : '<p class="empty-state">No messages yet.</p>';

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(data.title)} · KeyLM Export</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f6f1e8;
        --surface: #ffffff;
        --surface-2: #f5eadb;
        --border: #dfcfbc;
        --ink: #241c14;
        --muted: #6a5d52;
        --accent: #e56f2e;
        --accent-soft: rgba(229, 111, 46, 0.12);
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        font-family: Inter, system-ui, sans-serif;
        background: var(--bg);
        color: var(--ink);
        line-height: 1.55;
      }

      .page {
        max-width: 920px;
        margin: 0 auto;
        padding: 32px 24px 48px;
      }

      .hero,
      .message {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 20px;
        box-shadow: 0 10px 30px rgba(36, 28, 20, 0.08);
      }

      .meta-card {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 20px;
        box-shadow: 0 10px 30px rgba(36, 28, 20, 0.08);
      }

      .hero {
        padding: 28px;
        margin-bottom: 18px;
      }

      .badge {
        display: inline-flex;
        padding: 5px 12px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      h1 {
        margin: 14px 0 10px;
        font-size: 2rem;
        line-height: 1.15;
      }

      h2 {
        margin: 0 0 12px;
        font-size: 1rem;
      }

      .hero-meta {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin-top: 18px;
      }

      .hero-meta div {
        padding: 12px 14px;
        border-radius: 14px;
        border: 1px solid var(--border);
        background: var(--surface-2);
      }

      .hero-meta strong,
      .message-head strong {
        display: block;
        font-size: 0.9rem;
      }

      .hero-meta span,
      .message-head span,
      .print-tip,
      .usage,
      .empty-state {
        color: var(--muted);
        font-size: 0.9rem;
      }

      .print-tip {
        margin-top: 14px;
      }

      .meta-stack {
        display: grid;
        gap: 16px;
        margin-bottom: 18px;
      }

      .meta-card {
        padding: 18px 20px;
      }

      .messages {
        display: grid;
        gap: 14px;
      }

      .message {
        padding: 18px 20px;
      }

      .message.user {
        border-color: #f0d0b5;
        background: #fff8f2;
      }

      .message-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }

      .message-copy {
        white-space: pre-wrap;
        word-break: break-word;
      }

      .usage {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--border);
      }

      pre {
        margin: 0;
        white-space: pre-wrap;
        word-break: break-word;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 0.88rem;
      }

      @media print {
        body {
          background: #fff;
        }

        .page {
          max-width: none;
          padding: 0;
        }

        .hero,
        .meta-card,
        .message {
          box-shadow: none;
          break-inside: avoid;
        }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="hero">
        <span class="badge">KeyLM Export</span>
        <h1>${escapeHtml(data.title)}</h1>
        <p class="print-tip">Use your browser print dialog and choose <strong>Save as PDF</strong> to download this conversation.</p>
        <div class="hero-meta">
          <div><strong>Provider</strong><span>${escapeHtml(data.provider)}</span></div>
          <div><strong>Model</strong><span>${escapeHtml(data.model)}</span></div>
          <div><strong>Created</strong><span>${escapeHtml(formatTimestamp(data.createdAt))}</span></div>
          <div><strong>Updated</strong><span>${escapeHtml(formatTimestamp(data.updatedAt))}</span></div>
          <div><strong>Exported</strong><span>${escapeHtml(formatTimestamp(data.exportedAt))}</span></div>
          <div><strong>Messages</strong><span>${escapeHtml(String(data.messageCount))}</span></div>
        </div>
      </section>

      <section class="meta-stack">
        ${systemPromptBlock}
        ${settingsBlock}
      </section>

      <section class="messages">${messagesBlock}</section>
    </main>
    <script>
      window.addEventListener('load', () => {
        window.print();
      });

      window.addEventListener('afterprint', () => {
        if (window.opener) {
          window.close();
        }
      });
    </script>
  </body>
</html>`;
}