import { supabaseAdmin } from './supabaseAdmin';
import { peekSpotifyCache, storeSpotifyCache } from './spotifyCache';
import { ratingStreak } from './streak';
import { sendPush } from './push';
import { logServerError } from './errorLog';

// "Keep your streak": at 19:00 in the person's time zone (migration 031's
// users.tz_offset), a push to anyone with a rating streak of two days or
// more who hasn't rated anything today — once a day. Run from the
// keep-alive ping, at most every 20 minutes.
let lastRun = 0;
let running = false;
export function maybeSendStreakReminders(): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (running || Date.now() - lastRun < 20 * 60000) return;
  lastRun = Date.now();
  running = true;
  (async () => {
    const admin = supabaseAdmin();
    const { data: subs } = await admin.from('push_subscriptions').select('user_id');
    const userIds = [...new Set((subs || []).map((s) => s.user_id as string))];
    if (!userIds.length) return;
    const { data: users, error } = await admin.from('users').select('id, tz_offset').in('id', userIds);
    if (error) return; // migration 031 not applied yet
    const since = new Date(Date.now() - 60 * 86400000).toISOString();
    for (const u of users || []) {
      const tz = Number(u.tz_offset);
      if (!Number.isFinite(tz)) continue;
      const local = new Date(Date.now() - tz * 60000);
      if (local.getUTCHours() !== 19) continue;
      const dayKey = local.toISOString().slice(0, 10);
      const sentKey = `streak-push:${u.id}:${dayKey}`;
      if (await peekSpotifyCache(sentKey)) continue;
      const { data: rows } = await admin.from('ratings').select('created_at').eq('user_id', u.id).gte('created_at', since);
      const { days, ratedToday } = ratingStreak((rows || []).map((r) => r.created_at as string), tz);
      if (days < 2 || ratedToday) continue;
      await storeSpotifyCache(sentKey, 1, 2 * 86400);
      await sendPush([u.id as string], { titleKey: 'push.streakTitle', bodyKey: 'push.streakBody', vars: { n: days }, url: '/', tag: 'streak' }).catch(() => 0);
    }
  })()
    .catch((err) => logServerError('streak reminders', err))
    .finally(() => { running = false; });
}
