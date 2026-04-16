import { UsageInfo } from '@/lib/providers/types';

const DEFAULT_PROVIDER_TIMEOUT_MS = 30_000;

function parseTimeout(raw: string | undefined) {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PROVIDER_TIMEOUT_MS;
}

export function getProviderTimeoutMs() {
  return parseTimeout(process.env.PROVIDER_REQUEST_TIMEOUT_MS);
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {}
) {
  const { timeoutMs = getProviderTimeoutMs(), signal, ...requestInit } = init;
  const controller = new AbortController();
  const safeTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_PROVIDER_TIMEOUT_MS;
  let timedOut = false;

  const handleAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', handleAbort, { once: true });
    }
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, safeTimeoutMs);

  try {
    return await fetch(input, {
      ...requestInit,
      signal: controller.signal
    });
  } catch (error) {
    if (timedOut) {
      throw new Error('Provider request timed out');
    }

    throw error;
  } finally {
    clearTimeout(timer);
    if (signal) {
      signal.removeEventListener('abort', handleAbort);
    }
  }
}

function toPositiveNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function finalizeUsage(usage: UsageInfo): UsageInfo | undefined {
  const promptTokens = toPositiveNumber(usage.promptTokens);
  const completionTokens = toPositiveNumber(usage.completionTokens);
  const totalTokens =
    toPositiveNumber(usage.totalTokens) ??
    (promptTokens !== undefined || completionTokens !== undefined
      ? (promptTokens ?? 0) + (completionTokens ?? 0)
      : undefined);

  if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
    return undefined;
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens
  };
}

export function fromOpenAIUsage(usage?: Record<string, number> | null) {
  if (!usage) {
    return undefined;
  }

  return finalizeUsage({
    promptTokens: usage.prompt_tokens ?? usage.input_tokens,
    completionTokens: usage.completion_tokens ?? usage.output_tokens,
    totalTokens: usage.total_tokens
  });
}

export function fromGeminiUsage(usage?: Record<string, number> | null) {
  if (!usage) {
    return undefined;
  }

  return finalizeUsage({
    promptTokens: usage.promptTokenCount,
    completionTokens: usage.candidatesTokenCount,
    totalTokens: usage.totalTokenCount
  });
}

export function fromAnthropicUsage(usage?: Record<string, number> | null) {
  if (!usage) {
    return undefined;
  }

  return finalizeUsage({
    promptTokens: usage.input_tokens,
    completionTokens: usage.output_tokens
  });
}

export async function readProviderError(response: Response, fallback: string) {
  const text = await response.text();
  if (!text) {
    return fallback;
  }

  try {
    const payload = JSON.parse(text) as { error?: { message?: string }; message?: string };
    return payload.error?.message ?? payload.message ?? text;
  } catch {
    return text;
  }
}
