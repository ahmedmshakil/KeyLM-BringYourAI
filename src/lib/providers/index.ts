import { ProviderAdapter, ProviderId } from '@/lib/providers/types';
import * as openai from '@/lib/providers/openai';
import * as gemini from '@/lib/providers/gemini';
import * as anthropic from '@/lib/providers/anthropic';
import * as groq from '@/lib/providers/groq';

type AdapterProviderId = ProviderId | 'openrouter';

export function getProviderAdapter(provider: AdapterProviderId): ProviderAdapter {
  switch (provider) {
    case 'openai':
      return openai;
    case 'gemini':
      return gemini;
    case 'anthropic':
      return anthropic;
    case 'openrouter':
    case 'groq':
      return groq;
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
