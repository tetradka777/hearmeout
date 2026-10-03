import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { loadPublicProfile } from '@/lib/publicProfile';
import { getCurrentUserId } from '@/lib/identity';
import { pickLanguage, translate, type Language, type TranslationKey } from '@/lib/i18n';

// Plain server component, deliberately outside AppProvider/AppGate — this
// is the one page in the app reachable without logging in, so a rating
// profile can be shared as a link. What an anonymous visitor sees here
// (open teaser vs. locked stub) is decided by the owner's own
// is_open_profile setting in getUserProfile, same as in-app viewing —
// going private closes this page and its link preview too.
//
// Layout follows vPublic() in reference/app.js: top bar, ink header with
// the add button, stats (ratings, average, top genre), taste fingerprint
// and top 4, then a preview of the link card. The real link card is the
// Open Graph image next to this file (opengraph-image.tsx).

async function requestLanguage(): Promise<Language> {
  return pickLanguage((await headers()).get('accept-language'));
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const data = await loadPublicProfile(handle);
  if (!data) return { title: 'HearMeOut' };
  const { profile } = data;
  const lang = await requestLanguage();
  const description = profile.locked
    ? translate(lang, 'pub.ogPrivateSub')
    : translate(lang, 'pub.ogTitle', { name: profile.name, count: profile.stats.ratings, avg: profile.stats.avg ? profile.stats.avg.toFixed(1) : '—' });
  const title = `${profile.name} — HearMeOut`;
  // openGraph must be set here too, or the root layout's generic og:title /
  // og:description win; the og:image comes from opengraph-image.tsx.
  return { title, description, openGraph: { title, description } };
}

export default async function PublicProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const [data, lang, viewerId, host] = await Promise.all([
    loadPublicProfile(handle),
    requestLanguage(),
    getCurrentUserId(),
    headers().then((h) => h.get('host') ?? 'hearmeout.art'),
  ]);
  const t = (key: TranslationKey, vars?: Record<string, string | number>) => translate(lang, key, vars);

  const topBar = (
    <div className="setrow" style={{ border: 0, padding: '18px 0 6px' }}>
      <a href="/" className="logo" style={{ color: 'inherit', textDecoration: 'none' }}><span className="mk" />hearmeout</a>
      {viewerId ? (
        <a className="btn ghost" href="/">{t('invite.openApp')}</a>
      ) : (
        <span className="acts" style={{ margin: 0 }}>
          <a className="btn ghost" href="/?auth=login">{t('pub.signIn')}</a>
          <a className="btn" href="/?auth=register">{t('pub.signUp')}</a>
        </span>
      )}
    </div>
  );

  if (!data) {
    return (
      <div className="rd">
        <div className="wrap">
          {topBar}
          <div className="tile empty" style={{ marginTop: 14 }}><p className="muted" style={{ fontWeight: 600 }}>{t('pub.notFound')}</p></div>
        </div>
      </div>
    );
  }

  const { profile, fingerprint, topGenre, top4 } = data;
  const first = profile.name.split(' ')[0];
  const bareHandle = profile.handle.replace(/^@/, '');
  const isSelf = viewerId === profile.id;
  const avg = profile.stats.avg ? profile.stats.avg.toFixed(1) : '—';
  // "Add" goes through the invite page, which already handles every state
  // (signed out → sign up with the request queued, pending, friends…).
  const addButton = isSelf ? null : (
    <a className="btn" href={`/invite/${profile.id}`}>{viewerId ? t('pub.addName', { name: first }) : t('pub.signUpToAdd', { name: first })}</a>
  );

  return (
    <div className="rd">
      <div className="wrap pubwrap">
        {topBar}
        <a className="crumb" href="/">‹ {t('pub.back')}</a>

        <div className="tile t-ink glow" style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <span
            className="avt lgA"
            style={profile.avatarUrl ? { backgroundImage: `url('${profile.avatarUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
          >
            {!profile.avatarUrl && profile.name[0].toUpperCase()}
          </span>
          <div style={{ flex: 1, minWidth: 180 }}>
            <p className="eyebrow muted" style={{ margin: 0 }}>{t('pub.eyebrow', { url: `${host}/u/${bareHandle}` })}</p>
            <h1 className="big" style={{ margin: 0, fontSize: 'clamp(34px,7vw,56px)' }}>{profile.name}</h1>
            <p className="muted" style={{ fontWeight: 600 }}>{profile.handle}</p>
          </div>
          {addButton && <div className="acts" style={{ margin: 0 }}>{addButton}</div>}
        </div>

        {profile.locked ? (
          <div className="tile t-soft2 empty" style={{ marginTop: 14 }}>
            <span className="num" style={{ fontSize: 54 }}>🔒</span>
            <h3>{t('pub.privateTitle')}</h3>
            <p className="muted" style={{ fontWeight: 600 }}>{t('pub.privateBody', { name: first })}</p>
            {addButton}
          </div>
        ) : (
          <>
            <div className="stats3">
              <div className="tile t-pop"><span className="num">{profile.stats.ratings}</span><small>{t('pub.ratings')}</small></div>
              <div className="tile t-ac"><span className="num">{avg}</span><small>{t('pub.avgScore')}</small></div>
              <div className="tile t-ink"><span className="num" style={{ fontSize: 26 }}>{topGenre ?? '—'}</span><small>{t('pub.topGenre')}</small></div>
            </div>
            <div className="bento">
              <div className="tile">
                <h2>{t('pub.fingerprint')}</h2>
                {fingerprint.length ? (
                  <div className="fp">
                    {fingerprint.map((f) => (
                      <div className="fpc" key={f.genre}>
                        <b>{f.genre}</b>
                        <span className="num">{f.avg.toFixed(1)}</span>
                        <div className="meter"><i style={{ width: `${Math.round((f.avg / 5) * 100)}%` }} /></div>
                        <small className="muted" style={{ fontWeight: 700 }}>{t('pub.albumsCount', { count: f.count })}</small>
                      </div>
                    ))}
                  </div>
                ) : <p className="muted" style={{ fontWeight: 600 }}>{t('pub.fingerprintEmpty')}</p>}
              </div>
              <div className="tile">
                <h2>{t('pub.top4')}</h2>
                {top4.length ? (
                  <div className="t4">
                    {top4.map((a, i) => (
                      <div key={a.id} className="cov" role="img" aria-label={a.title} style={{ aspectRatio: '1', backgroundImage: a.cover ? `url('${a.cover}')` : undefined, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative' }}>
                        <span className="bdg">{i + 1}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="muted" style={{ fontWeight: 600 }}>{t('pub.fingerprintEmpty')}</p>}
              </div>
            </div>
          </>
        )}

        <div className="sec">
          <p className="eyebrow muted">{t('pub.ogEyebrow')}</p>
          <div className="og tile t-ink glow">
            <span className="logo"><span className="mk" />hearmeout</span>
            <h2 style={{ margin: 'auto 0 6px', fontSize: 'clamp(26px,5vw,40px)' }}>
              {profile.locked ? t('pub.ogPrivateTitle', { name: profile.name }) : t('pub.ogTitle', { name: profile.name, count: profile.stats.ratings, avg })}
            </h2>
            <p className="muted" style={{ fontWeight: 600 }}>
              {profile.locked ? t('pub.ogPrivateSub') : t('pub.ogSub', { genre: topGenre ?? '—', url: `${host}/u/${bareHandle}` })}
            </p>
          </div>
          <p className="muted" style={{ marginTop: 10, fontSize: 14, fontWeight: 600 }}>{t('pub.ogNote')}</p>
        </div>
      </div>
    </div>
  );
}
