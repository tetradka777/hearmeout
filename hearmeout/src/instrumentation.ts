// Runs once when the server starts (Next's instrumentation hook).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV !== 'production') return;
  const { watchStalls } = await import('./lib/stallWatch');
  watchStalls();
}
