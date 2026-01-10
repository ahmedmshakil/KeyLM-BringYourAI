export type ProviderErrorCode =
  | 'invalid_key'
  | 'insufficient_permissions'
  | 'rate_limited'
  | 'billing'
  | 'network'
  | 'unknown';

export function mapProviderError(message: string): ProviderErrorCode {
  const lower = message.toLowerCase();
  if (lower.includes('unauthorized') || lower.includes('invalid') || lower.includes('api key')) {
    return 'invalid_key';
  }
  if (lower.includes('permission') || lower.includes('access')) {
    return 'insufficient_permissions';
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'rate_limited';
  }
  if (lower.includes('quota') || lower.includes('billing') || lower.includes('insufficient')) {
    return 'billing';
  }
  if (lower.includes('timeout') || lower.includes('network') || lower.includes('unavailable')) {
    return 'network';
  }
  return 'unknown';
}
