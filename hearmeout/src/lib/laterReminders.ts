import { supabaseAdmin } from './supabaseAdmin';
import { sendPush } from './push';
import { logServerError } from './errorLog';

// Reminders about "listen later" items (migration 035): each due item gets a
// 'later' notification and a push, then its next time (a day, a week or a
// month on, or none for a one-off). Runs from the /api/health ping (every
// ~5 minutes), production only. Separate from the release notifications, so
// they don't count towards that daily limit.
const EVERY_MS = 4 * 60 * 1000;
const BATCH = 300;
let lastRun = 0;
let running = false;

// The next time after `from` in steps of the repeat, past now (a server that
// was asleep for a while sends one reminder, not every missed one).
export function nextReminder(from: Date, every: string | null, now = new Date()): Date | null {
  if (!every) return null;
  const d = new Date(from);
  do {
    if (every === 'day') d.setUTCDate(d.getUTCDate() + 1);
    else if (every === 'week') d.setUTCDate(d.getUTCDate() + 7);
    else if (every === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
    else return null;
  } while (d <= now);
  return d;
}

export function maybeSendLaterReminders(): void {
  if (process.env.NODE_ENV !== 'production') return;
  if (running || Date.now() - lastRun < EVERY_MS) return;
  lastRun = Date.now();
  running = true;
  (async () => {
    const admin = supabaseAdmin();
    const now = new Date();
    const { data: due, error } = await admin.from('listen_later')
      .select('id, user_id, item_type, album_id, track_index, title, artist, cover_url, remind_at, remind_every')
      .not('remind_at', 'is', null).lte('remind_at', now.toISOString()).limit(BATCH);
    // Before migration 035 the columns don't exist: nothing to do.
    if (error) { if (!/remind_/.test(error.message)) throw error; return; }
    for (const r of due || []) {
      const next = nextReminder(new Date(r.remind_at as string), r.remind_every as string | null, now);
      // Moved on first, so a failed send never repeats every few minutes.
      await admin.from('listen_later').update({ remind_at: next ? next.toISOString() : null, remind_every: next ? r.remind_every : null }).eq('id', r.id);
      await admin.from('notifications').insert({
        user_id: r.user_id, actor_id: null, kind: 'later',
        payload: { albumId: r.album_id, trackIndex: r.track_index, title: r.title, artist: r.artist, cover: r.cover_url },
      });
      await sendPush([r.user_id as string], {
        titleKey: 'push.laterTitle',
        bodyKey: r.artist ? 'push.laterBody' : 'push.laterBodyNoArtist',
        vars: { title: r.title as string, artist: (r.artist as string | null) ?? '' },
        url: `/?screen=rate&id=${encodeURIComponent(r.album_id as string)}`,
        tag: `later-${r.id}`,
      }).catch(() => 0);
    }
  })()
    .catch((err) => logServerError('later reminders', err))
    .finally(() => { running = false; });
}
