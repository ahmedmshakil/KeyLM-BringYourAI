import { Message, Thread } from '@prisma/client';
import { prisma } from '@/lib/db';
import { ProviderId, UsageInfo } from '@/lib/providers/types';
import type {
  ModelUsageSummary,
  ProviderUsageSummary,
  TokenTotals,
  UsageCoverage,
  UsageDashboardResponse,
  UsageDensitySummary,
  UsageRangeKey,
  UsageRangeSummary,
  UsageSeriesPoint
} from '@/lib/usageDashboard';
import { finalizeUsage } from '@/lib/providers/utils';
import { getRuntimeProvider } from '@/lib/services/threadRuntime';

type UsageMetadata = {
  usage?: UsageInfo;
};

type UsageThreadContext = Pick<Thread, 'provider' | 'model' | 'settings'>;

type UsageMessageRecord = {
  createdAt: Date;
  provider: ProviderId;
  model: string;
  usage: UsageInfo | null;
  hasUsage: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const EMPTY_TOTALS: TokenTotals = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  requestCount: 0
};

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_MS);
}

function startOfUtcWeek(value: Date) {
  const dayStart = startOfUtcDay(value);
  const day = dayStart.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addUtcDays(dayStart, diff);
}

function formatDayLabel(value: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(value);
}

function formatWeekLabel(value: Date) {
  return `Wk ${formatDayLabel(value)}`;
}

function startOfUtcMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function addUtcMonths(value: Date, months: number) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1));
}

function formatMonthLabel(value: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC'
  }).format(value);
}

function extractUsage(metadata: Message['metadata']) {
  const usage = (metadata as UsageMetadata | null)?.usage;
  if (!usage) {
    return null;
  }

  return finalizeUsage(usage) ?? null;
}

function sumTokenTotals(items: UsageMessageRecord[]): TokenTotals {
  return items.reduce<TokenTotals>((acc, item) => {
    if (!item.usage) {
      return acc;
    }

    acc.promptTokens += item.usage.promptTokens ?? 0;
    acc.completionTokens += item.usage.completionTokens ?? 0;
    acc.totalTokens += item.usage.totalTokens ?? 0;
    acc.requestCount += 1;
    return acc;
  }, { ...EMPTY_TOTALS });
}

function buildCoverage(items: UsageMessageRecord[]): UsageCoverage {
  return items.reduce<UsageCoverage>(
    (acc, item) => {
      if (item.hasUsage) {
        acc.messagesWithUsage += 1;
      } else {
        acc.messagesWithoutUsage += 1;
      }

      return acc;
    },
    { messagesWithUsage: 0, messagesWithoutUsage: 0 }
  );
}

function buildProviderUsageSummary(items: UsageMessageRecord[]): ProviderUsageSummary[] {
  const providers = new Map<ProviderId, TokenTotals>();

  for (const item of items) {
    if (!item.usage) {
      continue;
    }

    const current = providers.get(item.provider) ?? { ...EMPTY_TOTALS };
    current.promptTokens += item.usage.promptTokens ?? 0;
    current.completionTokens += item.usage.completionTokens ?? 0;
    current.totalTokens += item.usage.totalTokens ?? 0;
    current.requestCount += 1;
    providers.set(item.provider, current);
  }

  const totalTokens = Array.from(providers.values()).reduce((sum, item) => sum + item.totalTokens, 0);

  return Array.from(providers.entries())
    .map(([provider, totals]) => ({
      provider,
      ...totals,
      percentageOfTotal: totalTokens > 0 ? (totals.totalTokens / totalTokens) * 100 : 0
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);
}

function buildModelUsageSummary(items: UsageMessageRecord[], limit = 8): ModelUsageSummary[] {
  const models = new Map<string, ModelUsageSummary>();

  for (const item of items) {
    if (!item.usage) {
      continue;
    }

    const key = `${item.provider}:${item.model}`;
    const current = models.get(key) ?? {
      provider: item.provider,
      model: item.model,
      ...EMPTY_TOTALS
    };

    current.promptTokens += item.usage.promptTokens ?? 0;
    current.completionTokens += item.usage.completionTokens ?? 0;
    current.totalTokens += item.usage.totalTokens ?? 0;
    current.requestCount += 1;
    models.set(key, current);
  }

  return Array.from(models.values())
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, limit);
}

function buildDailySeries(items: UsageMessageRecord[], days: number, now: Date): UsageSeriesPoint[] {
  const seriesStart = addUtcDays(startOfUtcDay(now), -(days - 1));
  const buckets = new Map<string, UsageMessageRecord[]>();

  for (const item of items) {
    if (item.createdAt < seriesStart) {
      continue;
    }

    const bucketStart = startOfUtcDay(item.createdAt).toISOString();
    const bucket = buckets.get(bucketStart) ?? [];
    bucket.push(item);
    buckets.set(bucketStart, bucket);
  }

  return Array.from({ length: days }, (_, index) => {
    const bucketStart = addUtcDays(seriesStart, index);
    const bucketEnd = addUtcDays(bucketStart, 1);
    const bucketItems = buckets.get(bucketStart.toISOString()) ?? [];

    return {
      label: formatDayLabel(bucketStart),
      bucketStart: bucketStart.toISOString(),
      bucketEnd: bucketEnd.toISOString(),
      ...sumTokenTotals(bucketItems)
    };
  });
}

function buildWeeklySeries(items: UsageMessageRecord[], weeks: number, now: Date): UsageSeriesPoint[] {
  const currentWeekStart = startOfUtcWeek(now);
  const seriesStart = addUtcDays(currentWeekStart, -7 * (weeks - 1));
  const buckets = new Map<string, UsageMessageRecord[]>();

  for (const item of items) {
    if (item.createdAt < seriesStart) {
      continue;
    }

    const bucketStart = startOfUtcWeek(item.createdAt).toISOString();
    const bucket = buckets.get(bucketStart) ?? [];
    bucket.push(item);
    buckets.set(bucketStart, bucket);
  }

  return Array.from({ length: weeks }, (_, index) => {
    const bucketStart = addUtcDays(seriesStart, index * 7);
    const bucketEnd = addUtcDays(bucketStart, 7);
    const bucketItems = buckets.get(bucketStart.toISOString()) ?? [];

    return {
      label: formatWeekLabel(bucketStart),
      bucketStart: bucketStart.toISOString(),
      bucketEnd: bucketEnd.toISOString(),
      ...sumTokenTotals(bucketItems)
    };
  });
}

function buildMonthlySeries(items: UsageMessageRecord[], months: number, now: Date): UsageSeriesPoint[] {
  const currentMonthStart = startOfUtcMonth(now);
  const seriesStart = addUtcMonths(currentMonthStart, -(months - 1));
  const buckets = new Map<string, UsageMessageRecord[]>();

  for (const item of items) {
    if (item.createdAt < seriesStart) {
      continue;
    }

    const bucketStart = startOfUtcMonth(item.createdAt).toISOString();
    const bucket = buckets.get(bucketStart) ?? [];
    bucket.push(item);
    buckets.set(bucketStart, bucket);
  }

  return Array.from({ length: months }, (_, index) => {
    const bucketStart = addUtcMonths(seriesStart, index);
    const bucketEnd = addUtcMonths(bucketStart, 1);
    const bucketItems = buckets.get(bucketStart.toISOString()) ?? [];

    return {
      label: formatMonthLabel(bucketStart),
      bucketStart: bucketStart.toISOString(),
      bucketEnd: bucketEnd.toISOString(),
      ...sumTokenTotals(bucketItems)
    };
  });
}

function buildDensitySummary(points: UsageSeriesPoint[]): UsageDensitySummary {
  const totalBuckets = points.length;
  const activeBuckets = points.filter((point) => point.totalTokens > 0 || point.requestCount > 0).length;

  return {
    activeBuckets,
    totalBuckets,
    densityPercentage: totalBuckets > 0 ? (activeBuckets / totalBuckets) * 100 : 0,
    averageTokensPerActiveBucket:
      activeBuckets > 0 ? points.reduce((sum, point) => sum + point.totalTokens, 0) / activeBuckets : 0,
    peakTokens: Math.max(0, ...points.map((point) => point.totalTokens)),
    peakRequestCount: Math.max(0, ...points.map((point) => point.requestCount))
  };
}

function buildRangeSummary(
  key: UsageRangeKey,
  label: string,
  windowLabel: string,
  items: UsageMessageRecord[],
  series: UsageSeriesPoint[]
): UsageRangeSummary {
  return {
    key,
    label,
    windowLabel,
    totals: sumTokenTotals(items),
    coverage: buildCoverage(items),
    providers: buildProviderUsageSummary(items),
    models: buildModelUsageSummary(items, 5),
    series,
    density: buildDensitySummary(series)
  };
}

async function collectUsageMessages(userId: string, windowStart: Date): Promise<UsageMessageRecord[]> {
  const messages = await prisma.message.findMany({
    where: {
      role: 'assistant',
      createdAt: {
        gte: windowStart
      },
      thread: {
        is: {
          userId
        }
      }
    },
    select: {
      createdAt: true,
      metadata: true,
      thread: {
        select: {
          provider: true,
          model: true,
          settings: true
        }
      }
    }
  });

  return messages.map((message) => {
    const usage = extractUsage(message.metadata);

    return {
      createdAt: message.createdAt,
      provider: getRuntimeProvider(message.thread as UsageThreadContext),
      model: message.thread.model,
      usage,
      hasUsage: usage !== null
    };
  });
}

export async function getUsageDashboard(userId: string): Promise<UsageDashboardResponse> {
  const now = new Date();
  const last10dStart = addUtcDays(startOfUtcDay(now), -9);
  const last8wStart = addUtcDays(startOfUtcWeek(now), -7 * 7);
  const last12mStart = addUtcMonths(startOfUtcMonth(now), -11);
  const last30dStart = addUtcDays(startOfUtcDay(now), -29);
  const last7dStart = addUtcDays(startOfUtcDay(now), -6);

  const rows = await collectUsageMessages(userId, last12mStart);
  const rows30d = rows.filter((row) => row.createdAt >= last30dStart);
  const rows7d = rows.filter((row) => row.createdAt >= last7dStart);
  const rows10d = rows.filter((row) => row.createdAt >= last10dStart);
  const rows8w = rows.filter((row) => row.createdAt >= last8wStart);
  const rows12m = rows.filter((row) => row.createdAt >= last12mStart);

  const daily10d = buildDailySeries(rows, 10, now);
  const weekly8w = buildWeeklySeries(rows, 8, now);
  const monthly12m = buildMonthlySeries(rows, 12, now);

  return {
    generatedAt: now.toISOString(),
    defaultGrain: 'day',
    totals30d: sumTokenTotals(rows30d),
    totals7d: sumTokenTotals(rows7d),
    totals12m: sumTokenTotals(rows12m),
    coverage30d: buildCoverage(rows30d),
    providers30d: buildProviderUsageSummary(rows30d),
    models30d: buildModelUsageSummary(rows30d),
    daily10d,
    weekly8w,
    monthly12m,
    ranges: {
      day: buildRangeSummary('day', 'Daily', 'Last 10 days', rows10d, daily10d),
      week: buildRangeSummary('week', 'Weekly', 'Last 8 weeks', rows8w, weekly8w),
      month: buildRangeSummary('month', 'Monthly', 'Last 12 months', rows12m, monthly12m)
    }
  };
}
