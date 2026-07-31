import type { ProviderId } from '@/lib/providers/types';

export type UsageRangeKey = 'day' | 'week' | 'month';

export type TokenTotals = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestCount: number;
};

export type UsageCoverage = {
  messagesWithUsage: number;
  messagesWithoutUsage: number;
};

export type ProviderUsageSummary = TokenTotals & {
  provider: ProviderId;
  percentageOfTotal: number;
};

export type ModelUsageSummary = TokenTotals & {
  provider: ProviderId;
  model: string;
};

export type UsageSeriesPoint = TokenTotals & {
  label: string;
  bucketStart: string;
  bucketEnd: string;
};

export type UsageDensitySummary = {
  activeBuckets: number;
  totalBuckets: number;
  densityPercentage: number;
  averageTokensPerActiveBucket: number;
  peakTokens: number;
  peakRequestCount: number;
};

export type UsageRangeSummary = {
  key: UsageRangeKey;
  label: string;
  windowLabel: string;
  totals: TokenTotals;
  coverage: UsageCoverage;
  providers: ProviderUsageSummary[];
  models: ModelUsageSummary[];
  series: UsageSeriesPoint[];
  density: UsageDensitySummary;
};

export type UsageDashboardResponse = {
  generatedAt: string;
  defaultGrain: 'day';
  totals30d: TokenTotals;
  totals7d: TokenTotals;
  totals12m: TokenTotals;
  coverage30d: UsageCoverage;
  providers30d: ProviderUsageSummary[];
  models30d: ModelUsageSummary[];
  daily10d: UsageSeriesPoint[];
  weekly8w: UsageSeriesPoint[];
  monthly12m: UsageSeriesPoint[];
  ranges: Record<UsageRangeKey, UsageRangeSummary>;
};

const numberFormatter = new Intl.NumberFormat();
const compactNumberFormatter = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1
});

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: 'OpenAI',
  gemini: 'Gemini',
  anthropic: 'Anthropic',
  groq: 'Groq',
  xiaomi: 'Xiaomi MiMo'
};

export const formatTokenCount = (value: number) => numberFormatter.format(value);
export const formatCompactTokenCount = (value: number) => compactNumberFormatter.format(value);

export function formatTrackedCoverage(coverage: UsageCoverage) {
  const total = coverage.messagesWithUsage + coverage.messagesWithoutUsage;
  if (total === 0) {
    return 'No assistant replies in this range yet.';
  }

  if (coverage.messagesWithoutUsage === 0) {
    return `Tracking all ${coverage.messagesWithUsage} assistant replies in this range.`;
  }

  return `Tracking ${coverage.messagesWithUsage} of ${total} assistant replies in this range.`;
}

export function buildMountainChartPaths(points: UsageSeriesPoint[], width = 100, height = 56) {
  if (points.length === 0) {
    return { areaPath: '', linePath: '' };
  }

  const max = Math.max(1, ...points.map((point) => point.totalTokens));
  const usableHeight = height - 4;
  const step = points.length === 1 ? 0 : width / (points.length - 1);
  const firstX = points.length === 1 ? width / 2 : 0;
  const lastX = points.length === 1 ? width / 2 : width;

  const linePath = points
    .map((point, index) => {
      const x = points.length === 1 ? width / 2 : index * step;
      const normalizedHeight = point.totalTokens > 0 ? (point.totalTokens / max) * usableHeight : 0;
      const y = height - normalizedHeight - 2;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');

  const areaPath = `${linePath} L ${lastX.toFixed(2)} ${height.toFixed(2)} L ${firstX.toFixed(2)} ${height.toFixed(2)} Z`;

  return {
    areaPath,
    linePath
  };
}
