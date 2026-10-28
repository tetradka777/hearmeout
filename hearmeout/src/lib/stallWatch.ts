import { logServerError } from './errorLog';

// The server stalling: a timer that should tick every half second firing
// seconds late means the process was busy (or starved of CPU — the free
// Render instance has a tenth of a core) and every request waited, page
// code included. Written to the error log (at most every 10 minutes) with
// the memory in use, to see when it happens and whether memory is the
// reason.
const TICK_MS = 500;
const STALL_MS = 2000;
const EVERY_MS = 10 * 60 * 1000;

export function watchStalls(): void {
  let last = Date.now();
  let logged = 0;
  const timer = setInterval(() => {
    const now = Date.now();
    const late = now - last - TICK_MS;
    last = now;
    if (late < STALL_MS || now - logged < EVERY_MS) return;
    logged = now;
    const m = process.memoryUsage();
    const mb = (n: number) => Math.round(n / 1048576);
    logServerError('server stall', `${late} ms late; rss ${mb(m.rss)} MB, heap ${mb(m.heapUsed)}/${mb(m.heapTotal)} MB, up ${Math.round(process.uptime() / 60)} min`);
  }, TICK_MS);
  timer.unref();
}
