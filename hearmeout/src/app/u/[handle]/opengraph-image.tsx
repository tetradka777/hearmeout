import { ImageResponse } from 'next/og';
import { loadPublicProfile } from '@/lib/publicProfile';
import { translate } from '@/lib/i18n';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'HearMeOut profile';

// The link card for /u/[handle] (spec 13.16): logo, name, "N ratings · avg
// X.X", top genre. A private profile shows the name only — the same rule
// as the page itself, since both read the anonymous view. Link-preview
// crawlers rarely send Accept-Language, so the card is in English.
// Brand colours are fixed, like the app icon, and don't change with a user's
// selected site palette.
export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const data = await loadPublicProfile(handle);
  const name = data?.profile.name ?? 'HearMeOut';
  const locked = !data || !!data.profile.locked;
  const avg = data?.profile.stats.avg ? data.profile.stats.avg.toFixed(1) : '—';
  const title = locked
    ? translate('en', 'pub.ogPrivateTitle', { name })
    : translate('en', 'pub.ogTitle', { name, count: data!.profile.stats.ratings, avg });
  const sub = locked
    ? translate('en', 'pub.ogPrivateSub')
    : translate('en', 'pub.ogSub', { genre: data!.topGenre ?? '—', url: `hearmeoutt.art/u/${data!.profile.handle.replace(/^@/, '')}` });

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#27303E', padding: 64, fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <svg width="52" height="52" viewBox="0 0 96 96">
            <rect width="96" height="96" rx="26" fill="#F5EFDF" />
            <path d="M61 17.5C45.2 11.8 27.7 20.2 21.9 35.5c-6.1 16.1 2.5 34.2 18.9 39.2 16.4 5 32.6-5.2 34.6-21.2 1-8-2.3-15.1-8.5-20.2" fill="none" stroke="#27303E" strokeWidth="9" strokeLinecap="round" />
            <path d="M53.3 31.7c-9.3-2.4-17.9 3.8-18.8 12.8-.9 8.3 5.1 15.2 13.1 15.7 7.8.5 13.8-5.4 13.8-12.7 0-4.7-2.4-8.2-6-10.4" fill="none" stroke="#27303E" strokeWidth="7" strokeLinecap="round" />
            <circle cx="67.3" cy="22.5" r="6.7" fill="#E96E58" />
            <circle cx="67.3" cy="22.5" r="2.1" fill="#F5EFDF" />
          </svg>
          <div style={{ display: 'flex', fontSize: 48, fontWeight: 800, letterSpacing: -2, color: '#F6EFE0' }}>hearmeout</div>
        </div>
        <div style={{ display: 'flex', marginTop: 'auto', fontSize: 72, fontWeight: 800, letterSpacing: -2, color: '#F5EFDF', lineHeight: 1.05 }}>{title}</div>
        <div style={{ display: 'flex', marginTop: 18, fontSize: 32, color: '#D5CABB' }}>{sub}</div>
      </div>
    ),
    { ...size }
  );
}
