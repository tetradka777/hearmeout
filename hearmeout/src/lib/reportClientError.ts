// Sends a browser error to /api/errors (app_errors). The same message is
// sent once per page load and at most 10 in all, so a loop can't flood it.
const sent = new Set<string>();

export function reportClientError(message: string, stack?: string | null): void {
  if (typeof window === 'undefined' || !message) return;
  const key = message.slice(0, 200);
  if (sent.has(key) || sent.size >= 10) return;
  sent.add(key);
  const body = JSON.stringify({ message, stack: stack ?? null, url: location.pathname + location.search });
  try {
    fetch('/api/errors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch {
    // Reporting must never cause an error of its own.
  }
}
