export type ApiError = {
  code: string;
  message: string;
  retryable?: boolean;
  details?: Record<string, unknown>;
};

export function jsonResponse<T>(data: T, init?: ResponseInit) {
  return Response.json(data, init);
}

export function errorResponse(error: ApiError, status = 400) {
  return Response.json({ error }, { status });
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const candidate = forwardedFor.split(',')[0]?.trim();
    if (candidate) {
      return candidate;
    }
  }

  const realIp = request.headers.get('x-real-ip')?.trim();
  return realIp || 'unknown';
}
