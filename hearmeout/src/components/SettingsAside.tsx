'use client';

import type { ReactNode } from 'react';
import { useApp } from '@/lib/AppContext';
import { useCachedJson } from '@/lib/cachedJson';
import { fmt1 } from '@/lib/numberFormat';
import { toLocale, regionDisplayName } from '@/lib/i18n';
import { userAvatarStyle } from '@/lib/format';
import type { ChartAlbum } from '@/lib/appleCharts';
import { CoverArt } from './ui/CoverArt';
import { sinceLabel } from './screens/GroupsScreen';

// Settings side cards (prototype rev 9): a live, read-only card beside
// every tab but Appearance, built from the account's own data. A card with
// nothing to show isn't drawn.

function Row({ icon, title, sub, tag, on }: { icon: string; title: string; sub?: string; tag?: string; on?: boolean }) {
  return (
    <div className="r9">
      <span className="i9" aria-hidden="true"><i className={`ic ic-${icon}`} /></span>
      <span className="g"><b>{title}</b>{sub && <small className="muted">{sub}</small>}</span>
      {tag && <span className={`tag${on ? ' on9' : ''}`}>{tag}</span>}
    </div>
  );
}

function LanguageAside() {
  const { t, me, language } = useApp();
  const region = me?.region ?? null;
  const chart = useCachedJson<ChartAlbum[]>(`/api/charts/albums${region ? `?region=${encodeURIComponent(region)}` : ''}`).data;
  if (!me) return null;
  const loc = toLocale(language);
  const now = new Date();
  const dayLine = new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const time = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', hour12: me.timeFormat === '12' }).format(now);
  const dow = now.getDay();
  const back = me.weekStart === 'sun' ? dow : (dow + 6) % 7;
  const days = Array.from({ length: 7 }, (_, i) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - back + i));
  return (
    <>
      <div className="tile t-pop aside9">
        <small className="k9">{t('settings.previewTag')}</small>
        <h3 style={{ margin: '2px 0 4px' }}>{t('settings.previewTitle')}</h3>
        <p style={{ fontWeight: 800, fontSize: 20, lineHeight: 1.2 }}>{dayLine}</p>
        <p className="num" style={{ fontSize: 44, lineHeight: 1, margin: '6px 0 12px' }}>{time}</p>
        <div className="wk9" aria-label={t('settings.previewTitle')}>
          {days.map((d) => (
            <span key={d.toDateString()} className={`d9${d.toDateString() === now.toDateString() ? ' on' : ''}`}>
              <small>{new Intl.DateTimeFormat(loc, { weekday: 'short' }).format(d)}</small><b>{d.getDate()}</b>
            </span>
          ))}
        </div>
        <p style={{ fontWeight: 700, marginTop: 14 }}>{new Intl.NumberFormat(loc).format(1284.5)} · {t('settings.numberFormat')}</p>
      </div>
      {chart && chart.length > 0 && (
        <div className="tile aside9" style={{ marginTop: 14 }}>
          <small className="k9 muted">{t('settings.popularIn', { region: region ? regionDisplayName(region, language) : t('settings.worldwide') })}</small>
          <div className="cv9">
            {chart.slice(0, 3).map((a) => (
              <span key={a.spotifyId}><CoverArt url={a.cover ?? undefined} fallbackLetter={a.artist[0] || '?'} className="cov" px={90} style={{ width: '100%', aspectRatio: '1' }} /><small>{a.title}</small></span>
            ))}
          </div>
          <p className="muted" style={{ fontWeight: 600, fontSize: 13, marginTop: 10 }}>{t('settings.regionNote')}</p>
        </div>
      )}
    </>
  );
}

function AccountAside() {
  const { t, me, language, myRatings } = useApp();
  if (!me) return null;
  const n = myRatings.length;
  const avg = n ? myRatings.reduce((s, r) => s + r.stars, 0) / n : 0;
  // Ratings in each of the last six months.
  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => new Date(now.getFullYear(), now.getMonth() - 5 + i, 1));
  const perMonth = months.map((m) => myRatings.filter((r) => { const d = new Date(r.createdAt); return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth(); }).length);
  const mx = Math.max(1, ...perMonth);
  const monthName = (d: Date) => d.toLocaleDateString(toLocale(language), { month: 'short' });
  return (
    <>
      <div className="tile t-ink glow aside9" style={{ textAlign: 'left' }}>
        <span className="avt lgA" style={userAvatarStyle(me)}>{!me.avatarUrl && me.name[0]?.toUpperCase()}</span>
        <h2 style={{ margin: '12px 0 0' }}>{me.name}</h2>
        <p className="muted" style={{ fontWeight: 700 }}>@{me.handle.replace(/^@/, '')}{me.joinedAt ? ` · ${t('settings.joined', { date: sinceLabel(me.joinedAt, language) })}` : ''}</p>
        <div className="s3x">
          <div><b className="num">{n}</b><small>{t('settings.albumsRated')}</small></div>
          <div><b className="num">{n ? fmt1(avg) : '–'}</b><small>{t('settings.average')}</small></div>
          <div><b className="num">{me.friends.length}</b><small>{t('settings.friendsN')}</small></div>
        </div>
        {n > 0 && (
          <>
            <small className="k9">{t('settings.ratingsPerMonth')}</small>
            <span className="b9" aria-hidden="true">{perMonth.map((v, i) => <i key={i} style={{ height: `${Math.round((v / mx) * 100)}%` }} />)}</span>
            <div className="m9"><span>{monthName(months[0])}</span><span>{monthName(months[5])}</span></div>
          </>
        )}
      </div>
      <div className="tile aside9" style={{ marginTop: 14 }}>
        <h3 style={{ marginBottom: 6 }}>{t('settings.yourData')}</h3>
        <Row icon="check" title={t('settings.exportAll')} sub={t('settings.exportAllSub')} />
        <Row icon="eye" title={t('landing.whatWeStore')} sub={t('settings.whatWeStoreSub')} />
        <Row icon="x" title={t('settings.deleteAny')} sub={t('settings.deleteAnySub')} />
        <div className="acts"><a className="btn ghost" href="/privacy" target="_blank" rel="noreferrer">{t('landing.whatWeStore')}</a></div>
      </div>
    </>
  );
}

function ConnectionsAside() {
  const { t, me, language } = useApp();
  if (!me) return null;
  return (
    <>
      <div className="tile t-ac aside9">
        <small className="k9">{me.connections.spotify ? t('settings.spotifyConnectedTag') : t('settings.notConnectedTag')}</small>
        <p className="num" style={{ fontSize: 54, lineHeight: 1, margin: '6px 0 2px' }}>{new Intl.NumberFormat(toLocale(language)).format(me.playsCount ?? 0)}</p>
        <p style={{ fontWeight: 800 }}>{t('settings.playsImported')}</p>
      </div>
      <div className="tile aside9" style={{ marginTop: 14 }}>
        <h3 style={{ marginBottom: 6 }}>{t('settings.whatWeDo')}</h3>
        <Row icon="check" title={t('settings.readHistory')} sub={t('settings.readHistorySub')} />
        <Row icon="check" title={t('settings.matchPlays')} sub={t('settings.matchPlaysSub')} />
        <Row icon="x" title={t('settings.neverPost')} sub={t('settings.neverPostSub')} />
      </div>
    </>
  );
}

function PrivacyAside() {
  const { t, me } = useApp();
  if (!me) return null;
  const priv = !me.isOpenProfile;
  return (
    <>
      <div className="tile t-soft2 aside9">
        <small className="k9 muted">{t('settings.livePreview')}</small>
        <h3 style={{ margin: '2px 0 4px' }}>{t('settings.strangerSees')}</h3>
        <div className="mini9"><span className="avt" style={userAvatarStyle(me)}>{!me.avatarUrl && me.name[0]?.toUpperCase()}</span><div><b>{me.name}</b><small className="muted">@{me.handle.replace(/^@/, '')}</small></div></div>
        <Row icon={priv ? 'lock' : 'eye'} title={t('settings.pvProfile')} sub={priv ? t('settings.pvNameOnly') : t('settings.pvOpen')} tag={priv ? t('settings.pvHidden') : t('settings.pvVisible')} on={!priv} />
        <Row icon={me.publicReviews ? 'eye' : 'lock'} title={t('settings.pvReviews')} sub={me.publicReviews ? t('settings.pvAnyone') : t('settings.pvFriendsOnly')} tag={me.publicReviews ? t('settings.pvPublic') : t('settings.pvFriends')} on={me.publicReviews} />
        <Row icon={me.discoverable ? 'eye' : 'lock'} title={t('settings.pvSearch')} sub={me.discoverable ? t('settings.pvFindable') : t('settings.pvNotListed')} tag={me.discoverable ? t('settings.pvListed') : t('settings.pvHidden')} on={me.discoverable} />
      </div>
      <div className="tile aside9" style={{ marginTop: 14 }}>
        <small className="k9 muted">{t('settings.livePreview')}</small>
        <h3 style={{ margin: '2px 0 4px' }}>{t('settings.friendSees')}</h3>
        <Row icon={me.ratingsVisible ? 'eye' : 'lock'} title={t('settings.pvScores')} sub={me.ratingsVisible ? t('settings.pvShown') : t('settings.pvNotShown')} tag={me.ratingsVisible ? t('settings.pvVisible') : t('settings.pvHidden')} on={me.ratingsVisible} />
        <Row icon={me.shareLive ? 'eye' : 'lock'} title={t('settings.pvNowPlaying')} sub={me.shareLive ? t('settings.pvLive') : t('settings.pvNotShown')} tag={me.shareLive ? t('settings.pvVisible') : t('settings.pvHidden')} on={me.shareLive} />
        <Row icon="eye" title={t('settings.pvFriendList')} sub={t('settings.pvAlways')} tag={t('settings.pvVisible')} on />
      </div>
    </>
  );
}

export function SettingsAside({ section }: { section: string }): ReactNode {
  const card = section === 'language' ? <LanguageAside />
    : section === 'account' ? <AccountAside />
    : section === 'connections' ? <ConnectionsAside />
    : section === 'privacy' ? <PrivacyAside />
    : null;
  if (!card) return null;
  return <aside className="setside" aria-label={section}>{card}</aside>;
}
