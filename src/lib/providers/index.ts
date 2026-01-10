import { ProviderId } from '@/lib/providers/types';
import * as openai from '@/lib/providers/openai';
import * as gemini from '@/lib/providers/gemini';
import * as anthropic from '@/lib/providers/anthropic';

export function getProviderAdapter(provider: ProviderId) {
  switch (provider) {
    case 'openai':
      return openai;
    case 'gemini':
      return gemini;
    case 'anthropic':
      return anthropic;
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
