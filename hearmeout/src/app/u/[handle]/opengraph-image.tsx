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
// Colours are the default "lemons" palette's ink/cream/accent, as in the
// site-wide app/opengraph-image.tsx.
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
    : translate('en', 'pub.ogSub', { genre: data!.topGenre ?? '—', url: `hearmeout.art/u/${data!.profile.handle.replace(/^@/, '')}` });

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#294074', padding: 64, fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#F6EFE0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#D72E33' }} />
          </div>
          <div style={{ display: 'flex', fontSize: 48, fontWeight: 800, letterSpacing: -2, color: '#F6EFE0' }}>hearmeout</div>
        </div>
        <div style={{ display: 'flex', marginTop: 'auto', fontSize: 72, fontWeight: 800, letterSpacing: -2, color: '#F6EFE0', lineHeight: 1.05 }}>{title}</div>
        <div style={{ display: 'flex', marginTop: 18, fontSize: 32, color: '#C9BFAE' }}>{sub}</div>
      </div>
    ),
    { ...size }
  );
}
