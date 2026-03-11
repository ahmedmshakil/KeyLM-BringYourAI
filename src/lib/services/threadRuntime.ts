import { Thread } from '@prisma/client';
import { ProviderId } from '@/lib/providers/types';

type ThreadSettings = {
  temperature?: number;
  maxTokens?: number;
  runtimeSource?: 'groq' | 'openrouter';
  [key: string]: unknown;
};

function readThreadSettings(settings: unknown) {
  return (settings as ThreadSettings | null) ?? null;
}

export function buildThreadSettings(
  settings: Record<string, unknown> | undefined,
  runtimeProvider: ProviderId
) {
  if (!settings && runtimeProvider !== 'groq') {
    return undefined;
  }

  const nextSettings = { ...(settings ?? {}) } as ThreadSettings;
  if (runtimeProvider === 'groq') {
    nextSettings.runtimeSource = 'groq';
  }
  return nextSettings;
}

export function getRuntimeProvider(thread: Pick<Thread, 'provider' | 'settings'>): ProviderId {
  const settings = readThreadSettings(thread.settings);
  if (settings?.runtimeSource === 'groq' || settings?.runtimeSource === 'openrouter') {
    return 'groq';
  }
  if ((thread.provider as string) === 'openrouter') {
    return 'groq';
  }
  return thread.provider as ProviderId;
}

export function getPublicThreadSettings(settings: unknown) {
  const current = readThreadSettings(settings);
  if (!current) {
    return settings ?? null;
  }

  const { runtimeSource, ...publicSettings } = current;
  return Object.keys(publicSettings).length > 0 ? publicSettings : null;
}
