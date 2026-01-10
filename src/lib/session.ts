import crypto from 'crypto';

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

function base64Url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
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

export type SessionPayload = {
  sub: string;
  exp: number;
};

export function signSession(userId: string): string {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload: SessionPayload = {
    sub: userId,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  };
  const payloadEnc = base64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', getSecret())
    .update(`${header}.${payloadEnc}`)
    .digest();
  return `${header}.${payloadEnc}.${base64Url(signature)}`;
}

export function verifySession(token: string): SessionPayload | null {
  const [header, payload, signature] = token.split('.');
  if (!header || !payload || !signature) {
    return null;
  }
  const expectedSig = crypto
    .createHmac('sha256', getSecret())
    .update(`${header}.${payload}`)
    .digest();
  const sig = fromBase64Url(signature);
  if (sig.length !== expectedSig.length || !crypto.timingSafeEqual(sig, expectedSig)) {
    return null;
  }
  const decoded = JSON.parse(fromBase64Url(payload).toString('utf8')) as SessionPayload;
  if (decoded.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return decoded;
}

export const SESSION_COOKIE = 'keylm_session';
export const SESSION_MAX_AGE = TOKEN_TTL_SECONDS;
