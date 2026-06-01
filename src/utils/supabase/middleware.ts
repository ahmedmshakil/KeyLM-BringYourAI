import { type NextRequest, NextResponse } from 'next/server';

/**
 * Middleware pass-through — session validation happens in route handlers
 * via requireUser() (local JWT/HMAC check). No network round-trip needed.
 */
export async function updateSession(request: NextRequest) {
  return NextResponse.next({
    request: {
      headers: request.headers
    }
  });
}