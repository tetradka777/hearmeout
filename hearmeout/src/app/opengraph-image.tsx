import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'HearMeOut — rate music and compare taste with friends';

// Matches the prototype's actual logo mark (reference/app.js: <span
// class="logo"><span class="mk"></span>hearmeout</span>) instead of a
// separate hand-traced asset — a plain dot-in-circle plus the lowercase
// "hearmeout" wordmark, same as everywhere else in the app. Colours are
// the default "lemons" palette's --ink/--ac, since an OG image has no
// live theme/data-palette to read from.
export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', background: '#171410', gap: 28,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 58, height: 58, borderRadius: '50%', background: '#F6EFE0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#D72E33' }} />
          </div>
          <div style={{ display: 'flex', fontSize: 72, fontWeight: 800, letterSpacing: -4, color: '#F6EFE0', fontFamily: 'sans-serif' }}>hearmeout</div>
        </div>
        <div style={{ display: 'flex', fontSize: 30, color: '#a89a89', fontFamily: 'sans-serif' }}>
          Rate music and compare taste with friends
        </div>
      </div>
    ),
    { ...size }
  );
}
