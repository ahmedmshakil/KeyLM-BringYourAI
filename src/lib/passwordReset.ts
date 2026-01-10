import crypto from 'crypto';

const RESET_TOKEN_BYTES = 32;
const DEFAULT_TTL_MINUTES = 60;

function getTtlMinutes(): number {
  const raw = process.env.PASSWORD_RESET_TTL_MINUTES;
  if (!raw) {
    return DEFAULT_TTL_MINUTES;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TTL_MINUTES;
}

export function hashPasswordResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createPasswordResetToken() {
  const token = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
  const expiresAt = new Date(Date.now() + getTtlMinutes() * 60 * 1000);
  return { token, tokenHash: hashPasswordResetToken(token), expiresAt };
}
