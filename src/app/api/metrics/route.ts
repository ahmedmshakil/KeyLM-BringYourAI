import { timingSafeEqual } from 'node:crypto';
import { getMetricsContentType, getMetricsText } from '@/lib/metrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isValidMetricsToken(request: Request) {
  const expectedToken = process.env.METRICS_TOKEN?.trim();
  if (!expectedToken) {
    return false;
  }

  const authorization = request.headers.get('authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return false;
  }

  const providedToken = match[1].trim();
  const expected = Buffer.from(expectedToken);
  const provided = Buffer.from(providedToken);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export async function GET(request: Request) {
  if (!isValidMetricsToken(request)) {
    return new Response('Unauthorized\n', {
      status: 401,
      headers: {
        'Cache-Control': 'no-store',
        'WWW-Authenticate': 'Bearer'
      }
    });
  }

  return new Response(await getMetricsText(), {
    headers: {
      'Content-Type': getMetricsContentType(),
      'Cache-Control': 'no-store'
    }
  });
}
