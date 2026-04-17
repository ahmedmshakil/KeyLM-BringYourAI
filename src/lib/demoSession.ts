import crypto from 'crypto';

const DEMO_TTL_SECONDS = 60 * 60 * 24 * 7;

function base64Url(input: Buffer | string): string {
  const buffer = typeof input === 'string' ? Buffer.from(input) : input;
  return buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64Url(input: string): Buffer {
  const pad = 4 - (input.length % 4 || 4);
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  return Buffer.from(normalized, 'base64');
}

function getSecret(): Buffer {
  const raw = process.env.APP_AUTH_SECRET;
  if (!raw) {
    throw new Error('APP_AUTH_SECRET is not set');
  }
  return Buffer.from(raw, 'utf8');
}

export type DemoSessionPayload = {
  used: number;
  limit: number;
  exp: number;
};

export type DemoUsageSnapshot = {
  enabled: boolean;
  model: string;
  limit: number;
  used: number;
  remaining: number;
  exhausted: boolean;
};

export const DEMO_COOKIE = 'keylm_demo';
export const DEMO_COOKIE_MAX_AGE = DEMO_TTL_SECONDS;
export const DEMO_MESSAGE_LIMIT = 3;

export function signDemoSession(used: number, limit = DEMO_MESSAGE_LIMIT): string {
  const safeUsed = Math.max(0, Math.floor(used));
  const safeLimit = Math.max(1, Math.floor(limit));
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'KEYLM_DEMO' }));
  const payload: DemoSessionPayload = {
    used: Math.min(safeUsed, safeLimit),
    limit: safeLimit,
    exp: Math.floor(Date.now() / 1000) + DEMO_TTL_SECONDS
  };
  const payloadEnc = base64Url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', getSecret()).update(`${header}.${payloadEnc}`).digest();
  return `${header}.${payloadEnc}.${base64Url(signature)}`;
}

export function verifyDemoSession(token: string): DemoSessionPayload | null {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) {
    return null;
  }

  const expectedSig = crypto.createHmac('sha256', getSecret()).update(`${header}.${payload}`).digest();
  const sig = fromBase64Url(signature);
  if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(sig, expectedSig)) {
    return null;
  }

  let decoded: DemoSessionPayload;
  try {
    decoded = JSON.parse(fromBase64Url(payload).toString('utf8')) as DemoSessionPayload;
  } catch {
    return null;
  }

  if (
    typeof decoded.used !== 'number' ||
    typeof decoded.limit !== 'number' ||
    typeof decoded.exp !== 'number' ||
    decoded.limit <= 0 ||
    decoded.used < 0
  ) {
    return null;
  }

  if (decoded.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return {
    used: Math.min(Math.floor(decoded.used), Math.floor(decoded.limit)),
    limit: Math.max(1, Math.floor(decoded.limit)),
    exp: decoded.exp
  };
}

export function readDemoSession(token?: string | null, fallbackLimit = DEMO_MESSAGE_LIMIT) {
  const payload = token ? verifyDemoSession(token) : null;
  const limit = payload?.limit ?? Math.max(1, Math.floor(fallbackLimit));
  const used = payload?.used ?? 0;
  return {
    used: Math.min(Math.max(0, used), limit),
    limit
  };
}

export function buildDemoUsageSnapshot(options: {
  enabled: boolean;
  model: string;
  token?: string | null;
  limit?: number;
}): DemoUsageSnapshot {
  const session = readDemoSession(options.token, options.limit);
  return {
    enabled: options.enabled,
    model: options.model,
    limit: session.limit,
    used: session.used,
    remaining: Math.max(0, session.limit - session.used),
    exhausted: session.used >= session.limit
  };
}