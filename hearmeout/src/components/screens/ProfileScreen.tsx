'use client';

import { useMemo, useRef, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device } from '@/lib/types';
import { userAvatarStyle, formatJoinDate } from '@/lib/format';
import { regionDisplayName, getRegionCodes } from '@/lib/i18n';
import {
  GenresBlock, TasteFingerprint, RecentRatingsList, MyReviewsBlock, ListeningRecentBlock,
  Top4Grid, FriendRequestsBlock, FriendsBlock, AwardsBlock, LovedTracksColumn, LovedAlbumsColumn, LovedArtistsColumn,
} from '../ProfileBlocks';
import { StarIcon, BarsIcon } from '../ui/Icons';
import { GroupsIcon, SettingsIcon } from '../redesign/icons';
import { CoverArt } from '../ui/CoverArt';

type ProfileTab = 'ratings' | 'reviews' | 'loved' | 'taste' | 'awards' | 'listening' | 'friends' | 'later';

function AvatarPicker({ size = 96 }: { size?: number }) {
  const { t, me, updateAvatar } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  if (!me) return null;
  return (
    <div className="avwrap" onClick={() => inputRef.current?.click()}>
      <div className="dot" style={{ width: size, height: size, fontSize: size / 3, ...userAvatarStyle(me) }}>{!me.avatarUrl && me.name[0]}</div>
      <span className="avhint">{t('profile.changePhoto')}</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => updateAvatar(reader.result as string);
          reader.readAsDataURL(file);
        }}
      />
    </div>
  );
}

function PreviewPublicPageButton() {
  const { t, me } = useApp();
  if (!me) return null;
  return <a className="btn ghost" href={`/u/${me.handle.replace(/^@/, '')}`} target="_blank" rel="noreferrer">{t('profile.previewPublicPage')}</a>;
}

function ShareProfileButton() {
  const { t, me, showToast } = useApp();
  if (!me) return null;
  return (
    <button
      className="btn ghost"
      onClick={() => {
        const url = `${window.location.origin}/u/${me.handle.replace(/^@/, '')}`;
        navigator.clipboard.writeText(url).then(
          () => showToast(t('profile.shareLinkCopied')),
          () => showToast(url)
        );
      }}
    >
      {t('profile.shareProfile')}
    </button>
  );
}

function ShareLovedTracksButton() {
  const { t, lovedItems, showToast } = useApp();
  const shareable = lovedItems.filter((li) => li.type === 'track' && li.itemId);
  if (!shareable.length) return null;
  return (
    <button
      className="btn ghost"
      onClick={() => {
        const lines = shareable.map((li, i) => `${i + 1}. ${li.title} — ${li.artist}\nhttps://open.spotify.com/track/${li.itemId}`);
        const block = `${t('profile.lovedTracksShareHeader')}\n\n${lines.join('\n\n')}`;
        navigator.clipboard.writeText(block).then(
          () => showToast(t('profile.lovedTracksShareCopied')),
          () => showToast(block)
        );
      }}
    >
      {t('profile.shareLovedTracks')}
    </button>
  );
}

export function ProfileScreen(_props: { device: Device }) {
  const { t, language, me, myRatings, albums, liveAlbums, updateProfileName, updateProfileHandle, updateRegion, showScreen, viewHistory, laterItems } = useApp();
  const [tab, setTab] = useState<ProfileTab>('ratings');
  const regionCodes = useMemo(() => getRegionCodes(), []);

  const tasteFingerprint = useMemo(() => {
    const sums = new Map<string, { sum: number; count: number }>();
    for (const r of myRatings) {
      const a = liveAlbums[r.albumId] || albums.find((x) => x.id === r.albumId);
      if (!a?.genreBucket) continue;
      const cur = sums.get(a.genreBucket) || { sum: 0, count: 0 };
      cur.sum += r.stars;
      cur.count += 1;
      sums.set(a.genreBucket, cur);
    }
    return [...sums.entries()]
      .map(([g, { sum, count }]) => ({ g, avg: sum / count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 4);
  }, [myRatings, albums, liveAlbums]);

  if (!me) return null;

  const recentFive = [...myRatings].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  const TABS: { key: ProfileTab; label: string }[] = [
    { key: 'ratings', label: t('profile.tabRatings') },
    { key: 'reviews', label: t('profile.tabReviews') },
    { key: 'loved', label: t('profile.tabLoved') },
    { key: 'taste', label: t('profile.tabTaste') },
    { key: 'awards', label: t('profile.tabAwards') },
    { key: 'listening', label: t('profile.tabListening') },
    { key: 'friends', label: t('profile.tabFriends') },
    { key: 'later', label: t('nav.later') },
  ];

  return (
    <>
      <div className="tile t-ink hero">
        <div className="prof">
          <AvatarPicker />
          <div className="pinfo">
            <input
              className="pname"
              defaultValue={me.name}
              onBlur={async (e) => { if (!(await updateProfileName(e.target.value))) e.target.value = me.name; }}
            />
            <div className="phandle">
              <input
                defaultValue={me.handle}
                onBlur={async (e) => { if (!(await updateProfileHandle(e.target.value))) e.target.value = me.handle; }}
              />
            </div>
            <p className="muted">{t('profile.joined')} {formatJoinDate(me.joinedAt, language)} · {t('profile.tapToEditHint')}</p>
          </div>
          <div className="pcnt">
            <div><span className="num">{me.stats.ratings}</span><small>{t('profile.ratings')}</small></div>
            <div><span className="num">{me.stats.avg || '—'}</span><small>{t('profile.avg')}</small></div>
            <div><span className="num">{me.stats.reviews}</span><small>{t('profile.reviews')}</small></div>
            <div><span className="num">{me.friends.length}</span><small>{t('profile.friends')}</small></div>
          </div>
        </div>
        <div className="acts"><ShareProfileButton /><PreviewPublicPageButton /></div>
      </div>

      <div className="bento" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
        <button className="tile" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => viewHistory('profile')}>
          <StarIcon /><h3 style={{ marginTop: 8 }}>{t('profile.quickHistory')}</h3>
        </button>
        <button className="tile" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => showScreen('stats')}>
          <BarsIcon /><h3 style={{ marginTop: 8 }}>{t('profile.quickStats')}</h3>
        </button>
        <button className="tile" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => showScreen('groups')}>
          <GroupsIcon /><h3 style={{ marginTop: 8 }}>{t('profile.quickGroups')}</h3>
        </button>
        <div className="tile">
          <SettingsIcon /><h3 style={{ marginTop: 8 }}>{t('profile.quickSettings')}</h3>
          <div className="row" style={{ marginTop: 10 }}>
            <div className="g">{t('profile.region')}</div>
            <select className="field" value={me.region ?? ''} onChange={(e) => updateRegion(e.target.value || null)}>
              <option value="">{t('profile.regionNone')}</option>
              {regionCodes.map((code) => <option key={code} value={code}>{regionDisplayName(code, language)}</option>)}
            </select>
          </div>
          <button className="btn ghost" style={{ marginTop: 10, width: '100%' }} onClick={() => showScreen('settings')}>{t('settings.openAll')} →</button>
        </div>
      </div>

      <div className="chips">
        {TABS.map((tb) => (
          <button key={tb.key} className={`chip ${tab === tb.key ? 'on' : ''}`} onClick={() => setTab(tb.key)}>{tb.label}</button>
        ))}
      </div>

      {tab === 'ratings' && (
        <div className="bento b3">
          <div className="tile s2">
            <h3>{t('profile.ratingsSummary')}</h3>
            <div className="stats3" style={{ marginTop: 10 }}>
              <div className="tile"><span className="num">{me.stats.ratings}</span><small className="muted">{t('profile.ratings')}</small></div>
              <div className="tile"><span className="num">{me.stats.avg || '—'}</span><small className="muted">{t('profile.avg')}</small></div>
              <div className="tile"><span className="num">{me.stats.reviews}</span><small className="muted">{t('profile.reviews')}</small></div>
            </div>
            <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => viewHistory('profile')}>{t('profile.openHistoryStats')} →</button>
          </div>
          <div className="tile s2">
            <h3>{t('profile.recentRatings')}</h3>
            <div style={{ marginTop: 10 }}><RecentRatingsList ratings={recentFive} /></div>
            {me.stats.ratings > 5 && <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => viewHistory('profile')}>{t('profile.seeAllRatings', { count: me.stats.ratings })}</button>}
          </div>
        </div>
      )}

      {tab === 'reviews' && (
        <div className="bento b3">
          <div className="tile s3">
            <h3>{t('profile.tabReviews')}</h3>
            <div style={{ marginTop: 10 }}><MyReviewsBlock /></div>
          </div>
        </div>
      )}

      {tab === 'loved' && (
        <div className="bento b3">
          <div className="tile">
            <h3>{t('profile.lovedTypeTrack')}</h3>
            <div style={{ marginTop: 10 }}><LovedTracksColumn /></div>
          </div>
          <div className="tile">
            <h3>{t('profile.lovedTypeAlbum')}</h3>
            <div style={{ marginTop: 10 }}><LovedAlbumsColumn /></div>
          </div>
          <div className="tile">
            <h3>{t('profile.lovedTypeArtist')}</h3>
            <div style={{ marginTop: 10 }}><LovedArtistsColumn /></div>
          </div>
          <div className="tile s3"><ShareLovedTracksButton /></div>
        </div>
      )}

      {tab === 'taste' && (
        <div className="bento b3">
          <div className="tile s2">
            <h3>{t('profile.taste')}</h3>
            <p className="muted" style={{ margin: '-6px 0 10px' }}>{t('profile.tasteFingerprintSubtitle')}</p>
            <TasteFingerprint entries={tasteFingerprint} />
          </div>
          <div className="tile">
            <h3>{t('profile.favoriteGenres')}</h3>
            <p className="muted" style={{ margin: '-6px 0 10px' }}>{t('profile.favoriteGenresSubtitle')}</p>
            <GenresBlock genres={me.genres} />
          </div>
          <div className="tile s3">
            <h3>{t('profile.top4')}</h3>
            <div style={{ marginTop: 10 }}><Top4Grid ids={me.top4Albums} /></div>
          </div>
        </div>
      )}

      {tab === 'awards' && (
        <div className="bento b3">
          <div className="tile s3">
            <h3>{t('profile.monthAwards')}</h3>
            <div style={{ marginTop: 10 }}><AwardsBlock onGoToFriends={() => setTab('friends')} /></div>
          </div>
        </div>
      )}

      {tab === 'listening' && (
        <div className="bento b3">
          <div className="tile s3">
            <h3>{t('profile.tabListening')}</h3>
            <div style={{ marginTop: 10 }}><ListeningRecentBlock /></div>
          </div>
        </div>
      )}

      {tab === 'later' && (
        <div className="bento b3">
          <div className="tile s3">
            <h3>{t('nav.later')}</h3>
            <div className="stats3" style={{ marginTop: 10 }}>
              <div className="tile"><span className="num">{laterItems.filter((i) => i.type === 'album').length}</span><small className="muted">{t('later.tagAlbum')}</small></div>
              <div className="tile"><span className="num">{laterItems.filter((i) => i.type === 'track').length}</span><small className="muted">{t('later.tagTrack')}</small></div>
            </div>
            {laterItems.length ? (
              <div className="stack" style={{ marginTop: 10 }}>
                {[...laterItems].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5).map((item) => (
                  <div className="row" key={item.id}>
                    <CoverArt url={item.cover ?? undefined} fallbackLetter={(item.artist || item.title)[0] || '?'} className="cov" style={{ width: 40, height: 40 }} />
                    <div className="g"><b>{item.title}</b><div className="muted">{item.artist}</div></div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ marginTop: 10 }}>{t('later.emptyTitle')}</p>
            )}
            <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => showScreen('later')}>{t('later.openLater')} →</button>
          </div>
        </div>
      )}

      {tab === 'friends' && (
        <div className="bento b3">
          <div className="tile s3">
            <FriendRequestsBlock />
            <div className="setrow" style={{ border: 0, padding: 0, marginTop: 10 }}>
              <h3 style={{ marginBottom: 0 }}>{t('profile.friends')}</h3>
              <small className="muted">{me.friends.length}</small>
            </div>
            <div style={{ marginTop: 10 }}><FriendsBlock /></div>
          </div>
        </div>
      )}
    </>
  );
}
