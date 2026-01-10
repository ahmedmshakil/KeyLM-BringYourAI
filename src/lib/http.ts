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
