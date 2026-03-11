import { ChatMessage, ChatSettings, NormalizedModel, StreamChunk, StreamResult } from '@/lib/providers/types';
import { parseSseStream } from '@/lib/providers/sse';
import { fromOpenAIUsage, readProviderError } from '@/lib/providers/utils';

const BASE_URL = 'https://api.openai.com/v1';

function isChatModel(modelId: string) {
  return modelId.startsWith('gpt-') && !modelId.includes('instruct') && !modelId.includes('realtime');
}

export async function validateKey(key: string) {
  const res = await fetch(`${BASE_URL}/models`, {
    headers: {
      Authorization: `Bearer ${key}`
    }
  });
  if (!res.ok) {
    throw new Error(await readProviderError(res, 'OpenAI validation failed'));
  }
}

export async function listModels(key: string): Promise<NormalizedModel[]> {
  const res = await fetch(`${BASE_URL}/models`, {
    headers: {
      Authorization: `Bearer ${key}`
    }
  });
  if (!res.ok) {
    throw new Error(await readProviderError(res, 'OpenAI models fetch failed'));
  }
  const payload = (await res.json()) as { data: Array<{ id: string }> };
  const chatModels = payload.data.filter((model) => isChatModel(model.id));
  const usableModels = chatModels.length > 0 ? chatModels : payload.data;

  return usableModels.map((model) => ({
    id: model.id,
    displayName: model.id,
    provider: 'openai',
    capabilities: {
      streaming: true,
      vision: model.id.includes('vision') || model.id.includes('gpt-4o'),
      tools: model.id.includes('gpt-4'),
      json: model.id.includes('gpt-4')
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
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: settings.temperature ?? 0.7,
      max_tokens: settings.maxTokens,
      stream: false
    }),
    signal
  });

  if (!res.ok) {
    throw new Error(await readProviderError(res, 'OpenAI chat failed'));
  }

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: Record<string, number>;
  };
  const fullText = payload.choices?.[0]?.message?.content ?? '';
  return { fullText, usage: fromOpenAIUsage(payload.usage) };
}

export async function* streamChat(
  key: string,
  model: string,
  messages: ChatMessage[],
  settings: ChatSettings,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk, StreamResult, void> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: settings.temperature ?? 0.7,
      max_tokens: settings.maxTokens,
      stream: true,
      stream_options: {
        include_usage: true
      }
    }),
    signal
  });

  if (!res.ok || !res.body) {
    throw new Error(await readProviderError(res, 'OpenAI stream failed'));
  }

  let fullText = '';
  let usage: StreamResult['usage'];
  for await (const event of parseSseStream(res.body)) {
    if (event.data === '[DONE]') {
      break;
    }
    const json = JSON.parse(event.data) as {
      choices?: Array<{ delta?: { content?: string } }>;
      usage?: Record<string, number>;
    };
    if (json.usage) {
      usage = fromOpenAIUsage(json.usage);
    }
    const delta = json.choices?.[0]?.delta?.content;
    if (delta) {
      fullText += delta;
      yield { delta };
    }
  }

  return { fullText, usage };
}
