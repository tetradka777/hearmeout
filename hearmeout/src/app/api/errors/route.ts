import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/identity';
import { logError } from '@/lib/errorLog';
import { clientIp, hit, underLimit } from '@/lib/rateLimit';

// Browser errors (components/ErrorReporter, app/error.tsx) into app_errors.
// Open to signed-out visitors too, since the sign-in screen can fail; a
// few per address per ten minutes so it can't be used to fill the table.
export async function POST(request: NextRequest) {
  const key = `errors:${clientIp(request)}`;
  if (!underLimit(key, 20, 10 * 60 * 1000)) return NextResponse.json({ ok: false }, { status: 429 });
  hit(key);
  const body = await request.json().catch(() => null);
  if (typeof body?.message !== 'string' || !body.message.trim()) return NextResponse.json({ error: 'invalid_payload' }, { status: 400 });
  await logError({
    source: 'client',
    message: body.message,
    stack: typeof body.stack === 'string' ? body.stack : null,
    url: typeof body.url === 'string' ? body.url : null,
    userId: await getCurrentUserId(),
    userAgent: request.headers.get('user-agent'),
  });
  return NextResponse.json({ ok: true });
}
