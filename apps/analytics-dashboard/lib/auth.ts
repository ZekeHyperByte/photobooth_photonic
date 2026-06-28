import { NextRequest } from 'next/server';

/** Booth auth: shared X-API-Key (same key as sync ingest). */
export function isAuthorized(request: NextRequest): boolean {
  const apiKey = request.headers.get('X-API-Key');
  return !!apiKey && apiKey === process.env.API_KEY;
}
