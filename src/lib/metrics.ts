import { performance } from 'node:perf_hooks';
import {
  collectDefaultMetrics,
  Counter,
  Histogram,
  Registry
} from 'prom-client';

type MetricResult =
  | 'started'
  | 'success'
  | 'failure'
  | 'unauthorized'
  | 'rate_limited'
  | 'not_found'
  | 'invalid_request'
  | 'provider_error'
  | 'key_missing'
  | 'limit_reached'
  | 'disabled';

type MetricsState = {
  registry: Registry;
  httpRequestsTotal: Counter<string>;
  httpRequestDurationSeconds: Histogram<string>;
  httpErrorsTotal: Counter<string>;
  authEventsTotal: Counter<string>;
  supabaseAuthRequestsTotal: Counter<string>;
  databaseOperationsTotal: Counter<string>;
  appEventsTotal: Counter<string>;
};

type ApiRouteHandler<Context = unknown> = (
  request: Request,
  context: Context
) => Response | Promise<Response>;

const globalForMetrics = globalThis as typeof globalThis & {
  __keylmMetrics?: MetricsState;
};

const ROUTE_PATTERNS: Array<[RegExp, string]> = [
  [/^\/api\/threads\/[^/]+\/messages\/?$/, '/api/threads/[threadId]/messages'],
  [/^\/api\/threads\/[^/]+\/export\/?$/, '/api/threads/[threadId]/export'],
  [/^\/api\/threads\/[^/]+\/?$/, '/api/threads/[threadId]'],
  [/^\/api\/providers\/[^/]+\/models\/refresh\/?$/, '/api/providers/[provider]/models/refresh'],
  [/^\/api\/providers\/[^/]+\/models\/?$/, '/api/providers/[provider]/models'],
  [/^\/api\/providers\/[^/]+\/keys\/[^/]+\/validate\/?$/, '/api/providers/[provider]/keys/[keyId]/validate'],
  [/^\/api\/providers\/[^/]+\/keys\/[^/]+\/?$/, '/api/providers/[provider]/keys/[keyId]'],
  [/^\/api\/providers\/[^/]+\/keys\/?$/, '/api/providers/[provider]/keys']
];

function safeLabel(value: string, fallback = 'unknown') {
  const normalized = value
    .replace(/[^a-zA-Z0-9_:./\-[\]]/g, '_')
    .slice(0, 160);
  return normalized || fallback;
}

export function normalizeMetricsRoute(routeOrUrl: string) {
  let pathname = routeOrUrl;
  try {
    pathname = new URL(routeOrUrl).pathname;
  } catch {
    pathname = routeOrUrl.split('?')[0] || routeOrUrl;
  }

  pathname = pathname.replace(/\/+$/, '') || '/';
  for (const [pattern, replacement] of ROUTE_PATTERNS) {
    if (pattern.test(pathname)) {
      return replacement;
    }
  }

  return safeLabel(pathname);
}

function createMetricsState(): MetricsState {
  const registry = new Registry();
  collectDefaultMetrics({
    prefix: 'keylm_',
    register: registry
  });

  const httpRequestsTotal = new Counter({
    name: 'keylm_http_requests_total',
    help: 'Total HTTP API requests handled by KeyLM route handlers.',
    labelNames: ['method', 'route', 'status_code'],
    registers: [registry]
  });

  const httpRequestDurationSeconds = new Histogram({
    name: 'keylm_http_request_duration_seconds',
    help: 'HTTP API request duration in seconds for KeyLM route handlers.',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
    registers: [registry]
  });

  const httpErrorsTotal = new Counter({
    name: 'keylm_http_errors_total',
    help: 'Total HTTP API responses with status code 400 or higher.',
    labelNames: ['method', 'route', 'status_code'],
    registers: [registry]
  });

  const authEventsTotal = new Counter({
    name: 'keylm_auth_events_total',
    help: 'Safe authentication workflow events.',
    labelNames: ['event', 'result'],
    registers: [registry]
  });

  const supabaseAuthRequestsTotal = new Counter({
    name: 'keylm_supabase_auth_requests_total',
    help: 'Safe Supabase Auth request outcomes.',
    labelNames: ['operation', 'result'],
    registers: [registry]
  });

  const databaseOperationsTotal = new Counter({
    name: 'keylm_database_operations_total',
    help: 'Safe Prisma-backed database operation outcomes by operation name only.',
    labelNames: ['operation', 'result'],
    registers: [registry]
  });

  const appEventsTotal = new Counter({
    name: 'keylm_app_events_total',
    help: 'Safe KeyLM application workflow events.',
    labelNames: ['event', 'result'],
    registers: [registry]
  });

  return {
    registry,
    httpRequestsTotal,
    httpRequestDurationSeconds,
    httpErrorsTotal,
    authEventsTotal,
    supabaseAuthRequestsTotal,
    databaseOperationsTotal,
    appEventsTotal
  };
}

function getMetricsState() {
  globalForMetrics.__keylmMetrics ??= createMetricsState();
  return globalForMetrics.__keylmMetrics;
}

export function getMetricsContentType() {
  return getMetricsState().registry.contentType;
}

export function getMetricsText() {
  return getMetricsState().registry.metrics();
}

export function observeHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  durationSeconds: number
) {
  const state = getMetricsState();
  const labels = {
    method: safeLabel(method.toUpperCase()),
    route: normalizeMetricsRoute(route),
    status_code: String(statusCode)
  };

  state.httpRequestsTotal.inc(labels);
  state.httpRequestDurationSeconds.observe(labels, durationSeconds);

  if (statusCode >= 400) {
    state.httpErrorsTotal.inc(labels);
  }
}

export function recordAuthEvent(event: string, result: MetricResult) {
  getMetricsState().authEventsTotal.inc({
    event: safeLabel(event),
    result: safeLabel(result)
  });
}

export function recordSupabaseAuthRequest(operation: string, result: Extract<MetricResult, 'success' | 'failure'>) {
  getMetricsState().supabaseAuthRequestsTotal.inc({
    operation: safeLabel(operation),
    result: safeLabel(result)
  });
}

export function recordDatabaseOperation(operation: string, result: Extract<MetricResult, 'success' | 'failure'>) {
  getMetricsState().databaseOperationsTotal.inc({
    operation: safeLabel(operation),
    result: safeLabel(result)
  });
}

export async function withDatabaseMetrics<T>(operation: string, work: () => Promise<T>) {
  try {
    const result = await work();
    recordDatabaseOperation(operation, 'success');
    return result;
  } catch (error) {
    recordDatabaseOperation(operation, 'failure');
    throw error;
  }
}

export function recordAppEvent(event: string, result: MetricResult) {
  getMetricsState().appEventsTotal.inc({
    event: safeLabel(event),
    result: safeLabel(result)
  });
}

export function withApiMetrics<Context = unknown>(
  route: string,
  method: string,
  handler: ApiRouteHandler<Context>
): ApiRouteHandler<Context> {
  return async (request: Request, context: Context) => {
    const start = performance.now();
    let statusCode = 500;

    try {
      const response = await handler(request, context);
      statusCode = response.status;
      return response;
    } finally {
      observeHttpRequest(method, route, statusCode, (performance.now() - start) / 1000);
    }
  };
}
