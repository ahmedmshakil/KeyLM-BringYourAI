import { ChatMessage, ChatSettings, NormalizedModel, StreamChunk, StreamResult } from '@/lib/providers/types';
import { parseSseStream } from '@/lib/providers/sse';

const BASE_URL = 'https://api.anthropic.com/v1';
const VERSION = '2023-06-01';

function splitSystem(messages: ChatMessage[]) {
  const systemParts: string[] = [];
  const chat = [] as Array<{ role: 'user' | 'assistant'; content: string }>;
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemParts.push(msg.content);
    } else {
      chat.push({ role: msg.role, content: msg.content });
    }
  }
  return { system: systemParts.join('\n\n'), chat };
}

export async function validateKey(key: string) {
  const res = await fetch(`${BASE_URL}/models`, {
    headers: {
      'x-api-key': key,
      'anthropic-version': VERSION
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Anthropic validation failed');
  }
}

export async function listModels(key: string): Promise<NormalizedModel[]> {
  const res = await fetch(`${BASE_URL}/models`, {
    headers: {
      'x-api-key': key,
      'anthropic-version': VERSION
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Anthropic models fetch failed');
  }
  const payload = (await res.json()) as { data: Array<{ id: string }> };
  return payload.data.map((model) => ({
    id: model.id,
    displayName: model.id,
    provider: 'anthropic',
    capabilities: {
      streaming: true,
      vision: model.id.includes('vision'),
      tools: model.id.includes('tool'),
      json: model.id.includes('json')
    }
  }));
}

export async function chat(
  key: string,
  model: string,
  messages: ChatMessage[],
  settings: ChatSettings,
  signal?: AbortSignal
): Promise<StreamResult> {
  const { system, chat } = splitSystem(messages);
  const res = await fetch(`${BASE_URL}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      system: system || undefined,
      messages: chat,
      max_tokens: settings.maxTokens ?? 1024,
      temperature: settings.temperature ?? 0.7,
      stream: false
    }),
    signal
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Anthropic chat failed');
  }

  const payload = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: Record<string, number>;
  };
  const fullText = payload.content?.map((block) => block.text ?? '').join('') ?? '';
  return { fullText, usage: payload.usage };
}

export async function* streamChat(
  key: string,
  model: string,
  messages: ChatMessage[],
  settings: ChatSettings,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk, StreamResult, void> {
  const { system, chat } = splitSystem(messages);
  const res = await fetch(`${BASE_URL}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': VERSION,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      system: system || undefined,
      messages: chat,
      max_tokens: settings.maxTokens ?? 1024,
      temperature: settings.temperature ?? 0.7,
      stream: true
    }),
    signal
  });

  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(text || 'Anthropic stream failed');
  }

  let fullText = '';
  for await (const event of parseSseStream(res.body)) {
    if (!event.data) {
      continue;
    }
    const payload = JSON.parse(event.data) as {
      delta?: { text?: string };
      type?: string;
    };
    if (event.event === 'content_block_delta') {
      const delta = payload.delta?.text;
      if (delta) {
        fullText += delta;
        yield { delta };
      }
    }
    if (event.event === 'message_stop') {
      break;
    }
  }

  return { fullText };
}
