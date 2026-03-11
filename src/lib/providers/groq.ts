import { getFreeTierConfig } from '@/lib/freeTier';
import { ChatMessage, ChatSettings, NormalizedModel, StreamChunk, StreamResult } from '@/lib/providers/types';
import { parseSseStream } from '@/lib/providers/sse';
import { fromOpenAIUsage, readProviderError } from '@/lib/providers/utils';

function getBaseUrl() {
  return getFreeTierConfig().baseUrl;
}

function getCandidateModels(model: string) {
  const { fallbackModels } = getFreeTierConfig();
  const candidates = [model, ...fallbackModels];
  return candidates.filter((value, index) => value && candidates.indexOf(value) === index);
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
    max_tokens: settings.maxTokens,
    stream,
    stream_options: stream
      ? {
          include_usage: true
        }
      : undefined
  };
}

function shouldTryNextModel(status: number) {
  return status !== 401 && status !== 403;
}

async function createCompletionResponse(
  key: string,
  model: string,
  messages: ChatMessage[],
  settings: ChatSettings,
  stream: boolean,
  signal?: AbortSignal
) {
  const candidates = getCandidateModels(model);
  let lastError = 'Groq request failed';

  for (const candidate of candidates) {
    const response = await fetch(`${getBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(buildRequestBody(candidate, messages, settings, stream)),
      signal
    });

    if (response.ok) {
      return response;
    }

    lastError = await readProviderError(response, 'Groq request failed');
    if (!shouldTryNextModel(response.status) || candidate === candidates[candidates.length - 1]) {
      throw new Error(lastError);
    }
  }

  throw new Error(lastError);
}

export async function validateKey(key: string) {
  const res = await fetch(`${getBaseUrl()}/models`, {
    headers: {
      Authorization: `Bearer ${key}`
    }
  });

  if (!res.ok) {
    throw new Error(await readProviderError(res, 'Groq validation failed'));
  }
}

export async function listModels(key: string): Promise<NormalizedModel[]> {
  if (!key.trim()) {
    throw new Error('Groq key is required');
  }

  return getCandidateModels(getFreeTierConfig().model).map((model) => ({
    id: model,
    displayName: model,
    provider: 'groq',
    capabilities: {
      streaming: true,
      vision: false,
      tools: false,
      json: false
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
  const res = await createCompletionResponse(key, model, messages, settings, false, signal);

  const payload = (await res.json()) as {
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
  const res = await createCompletionResponse(key, model, messages, settings, true, signal);

  if (!res.body) {
    throw new Error('Groq stream failed');
  }

  let fullText = '';
  let usage: StreamResult['usage'];

  for await (const event of parseSseStream(res.body)) {
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
