import webpush from 'web-push';
import { supabaseAdmin } from './supabaseAdmin';
import { normalizeLanguage, translate, type Language, type TranslationKey } from './i18n';
import { logServerError } from './errorLog';

// Web push (migration 027's push_subscriptions). Needs VAPID keys in the
// environment: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and
// VAPID_SUBJECT (a URL or mailto: for push services to contact). Without
// them push is off and nothing is sent.
export function pushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let vapidSet = false;
function ensureVapid(): boolean {
  if (!pushConfigured()) return false;
  if (!vapidSet) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://hearmeoutt.art', process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    vapidSet = true;
  }
  return true;
}

type Sub = { id: number; endpoint: string; p256dh: string; auth: string; language: string | null; last_recap_week?: string | null };
export type PushMessage = { titleKey: TranslationKey; bodyKey: TranslationKey; vars?: Record<string, string | number>; url: string; tag?: string };

// Sends one message to every device of these users, each in the language it
// subscribed with. A subscription the push service says is gone (404/410)
// is deleted.
export async function sendPush(userIds: string[], msg: PushMessage): Promise<number> {
  if (!userIds.length || !ensureVapid()) return 0;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth, language').in('user_id', userIds);
  if (error || !data?.length) return 0;
  return sendToSubscriptions(data as Sub[], msg);
}

export async function sendToSubscriptions(subs: Sub[], msg: PushMessage): Promise<number> {
  if (!subs.length || !ensureVapid()) return 0;
  const admin = supabaseAdmin();
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    const lang = normalizeLanguage(s.language);
    const payload = JSON.stringify({
      title: translate(lang, msg.titleKey, msg.vars),
      body: translate(lang, msg.bodyKey, msg.vars),
      url: msg.url,
      tag: msg.tag,
    });
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 24 * 3600 });
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', s.id);
      else logServerError('push send', err);
    }
  }));
  return sent;
}
