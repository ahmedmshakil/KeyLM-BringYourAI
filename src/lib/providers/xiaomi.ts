import { getXiaomiConfig, getSharedModels } from '@/lib/freeTier';
import { ChatMessage, ChatSettings, NormalizedModel, StreamChunk, StreamResult } from '@/lib/providers/types';
import { parseSseStream } from '@/lib/providers/sse';
import { fetchWithTimeout, fromOpenAIUsage, readProviderError } from '@/lib/providers/utils';

function getBaseUrl() {
  return getXiaomiConfig().baseUrl;
}

function headers(key: string) {
  return {
    'api-key': key,
    'Content-Type': 'application/json'
  };
}

function buildRequestBody(
  model: string,
  messages: ChatMessage[],
  settings: ChatSettings,
  stream: boolean
) {
  return {
    model,
    messages,
    temperature: settings.temperature ?? 0.7,
    max_completion_tokens: settings.maxTokens,
    stream
  };
}

async function createCompletionResponse(
  key: string,
  model: string,
  messages: ChatMessage[],
  settings: ChatSettings,
  stream: boolean,
  signal?: AbortSignal
) {
  const response = await fetchWithTimeout(`${getBaseUrl()}/chat/completions`, {
    method: 'POST',
    headers: headers(key),
    body: JSON.stringify(buildRequestBody(model, messages, settings, stream)),
    signal
  });

  if (!response.ok) {
    throw new Error(await readProviderError(response, 'Xiaomi MiMo request failed'));
  }

  return response;
}

export async function validateKey(key: string) {
  const response = await fetchWithTimeout(`${getBaseUrl()}/models`, {
    headers: headers(key)
  });
  if (!response.ok) {
    throw new Error(await readProviderError(response, 'Xiaomi MiMo validation failed'));
  }
}

export async function listModels(key: string): Promise<NormalizedModel[]> {
  if (!key.trim()) {
    throw new Error('Xiaomi MiMo key is required');
  }

  return getSharedModels()
    .filter((model) => model.provider === 'xiaomi')
    .map((model) => ({
      id: model.id,
      displayName: model.displayName,
      provider: 'xiaomi',
      capabilities: { streaming: true, vision: false, tools: false, json: false }
    }));
}

export async function chat(
  key: string,
  model: string,
  messages: ChatMessage[],
  settings: ChatSettings,
  signal?: AbortSignal
): Promise<StreamResult> {
  const response = await createCompletionResponse(key, model, messages, settings, false, signal);
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: Record<string, number>;
  };

  return {
    fullText: payload.choices?.[0]?.message?.content ?? '',
    usage: fromOpenAIUsage(payload.usage)
  };
}

export async function* streamChat(
  key: string,
  model: string,
  messages: ChatMessage[],
  settings: ChatSettings,
  signal?: AbortSignal
): AsyncGenerator<StreamChunk, StreamResult, void> {
  const response = await createCompletionResponse(key, model, messages, settings, true, signal);
  if (!response.body) {
    throw new Error('Xiaomi MiMo stream failed');
  }

  let fullText = '';
  let usage: StreamResult['usage'];
  for await (const event of parseSseStream(response.body)) {
    if (event.data === '[DONE]') {
      break;
    }

    const payload = JSON.parse(event.data) as {
      choices?: Array<{ delta?: { content?: string } }>;
      usage?: Record<string, number>;
    };
    if (payload.usage) {
      usage = fromOpenAIUsage(payload.usage);
    }

    const delta = payload.choices?.[0]?.delta?.content;
    if (!delta) {
      continue;
    }

    fullText += delta;
    yield { delta };
  }

  return { fullText, usage };
}
