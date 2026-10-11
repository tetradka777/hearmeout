import { supabaseAdmin } from './supabaseAdmin';
import { pushConfigured, sendToSubscriptions } from './push';
import { logServerError } from './errorLog';

// "Your weekly recap is ready": from Monday 07:00 UTC (10:00 in Moscow),
// one push per device for the week that just ended, to people who listened
// to something that week. Each subscription remembers the last week it was
// told about, so a week is never sent twice. Runs from the keep-alive ping
// (production only), checking at most every half hour.
const CHECK_EVERY_MS = 30 * 60 * 1000;
let lastCheck = 0;
let running = false;

// Monday (UTC) starting the last completed Monday–Sunday week.
function lastWeekStart(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - (sinceMonday + 7) * 86400000);
}

export function maybeSendWeeklyRecaps(): void {
  if (process.env.NODE_ENV !== 'production' || !pushConfigured()) return;
  if (running || Date.now() - lastCheck < CHECK_EVERY_MS) return;
  const now = new Date();
  // Monday before 07:00 UTC: too early, the week has only just ended.
  if (now.getUTCDay() === 1 && now.getUTCHours() < 7) return;
  lastCheck = Date.now();
  running = true;
  send(now).catch((err) => logServerError('weekly recap push', err)).finally(() => { running = false; });
}

async function send(now: Date): Promise<void> {
  const start = lastWeekStart(now);
  const end = new Date(start.getTime() + 7 * 86400000);
  const weekKey = start.toISOString().slice(0, 10);
  const admin = supabaseAdmin();
  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth, language, last_recap_week')
    .or(`last_recap_week.is.null,last_recap_week.neq.${weekKey}`);
  if (error || !subs?.length) return;

  const byUser = new Map<string, typeof subs>();
  for (const s of subs) byUser.set(s.user_id as string, [...(byUser.get(s.user_id as string) || []), s]);
  for (const [userId, list] of byUser) {
    const { count } = await admin.from('listening_events').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).gte('played_at', start.toISOString()).lt('played_at', end.toISOString());
    if (count) {
      await sendToSubscriptions(list as Parameters<typeof sendToSubscriptions>[0], {
        titleKey: 'push.weeklyRecapTitle',
        bodyKey: 'push.weeklyRecapBody',
        url: `/?screen=recap&id=${userId}&period=week`,
        tag: `recap-${weekKey}`,
      });
    }
    await admin.from('push_subscriptions').update({ last_recap_week: weekKey }).in('id', list.map((s) => s.id));
  }
}
