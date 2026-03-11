import { UsageInfo } from '@/lib/providers/types';

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
