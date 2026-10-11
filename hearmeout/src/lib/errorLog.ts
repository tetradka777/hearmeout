import { supabaseAdmin } from './supabaseAdmin';

// Errors kept in the app_errors table (migration 027), from the server here
// and from browsers through /api/errors, so a failure on the live site shows
// up somewhere other than one visitor's console. Best effort: logging never
// throws, and before the migration it just does nothing.
export type ErrorEntry = { source: 'client' | 'server'; message: string; stack?: string | null; url?: string | null; userId?: string | null; userAgent?: string | null };

const cut = (s: string | null | undefined, n: number) => (s ? String(s).slice(0, n) : null);

export async function logError(e: ErrorEntry): Promise<void> {
  try {
    await supabaseAdmin().from('app_errors').insert({
      source: e.source,
      message: cut(e.message, 500) || 'unknown',
      stack: cut(e.stack, 4000),
      url: cut(e.url, 300),
      user_id: e.userId ?? null,
      user_agent: cut(e.userAgent, 300),
    });
  } catch {
    // The log is a help, not a dependency.
  }
}

// For catch blocks on the server: the console (Render's log) and the table.
export function logServerError(where: string, err: unknown): void {
  console.error(`${where}:`, err);
  const message = err instanceof Error ? err.message : String(err);
  void logError({ source: 'server', message: `${where}: ${message}`, stack: err instanceof Error ? err.stack : null });
}
