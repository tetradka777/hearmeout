'use client';

import { useMemo, useRef, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import type { Device } from '@/lib/types';
import { userAvatarStyle, formatJoinDate } from '@/lib/format';
import { regionDisplayName, pluralForKey } from '@/lib/i18n';
import {
  GenresBlock, TasteFingerprint, RecentRatingsList, MyReviewsBlock, ListeningRecentBlock,
  Top4Grid, FriendRequestsBlock, FriendsBlock, AwardsBlock, LovedTracksBlock,
} from '../ProfileBlocks';
import { StarIcon, BarsIcon } from '../ui/Icons';
import { GroupsIcon, SettingsIcon } from '../redesign/icons';

type ProfileTab = 'ratings' | 'reviews' | 'awards' | 'listening' | 'friends';

function ProfileBanner() {
  const { me } = useApp();
  if (!me?.bannerUrl) return null;
  return <div style={{ height: 140, borderRadius: 'var(--r)', marginBottom: 14, backgroundImage: `url('${me.bannerUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center' }} />;
}

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

function SettingsSummary() {
  const { t, me, language, showScreen } = useApp();
  if (!me) return null;
  return (
    <div className="tile">
      <h3>{t('settings.eyebrow')}</h3>
      <div className="row"><div className="g">{t('profile.region')}</div><small className="muted">{me.region ? regionDisplayName(me.region, language) : t('profile.regionNone')}</small></div>
      <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => showScreen('settings')}>{t('settings.openAll')} →</button>
    </div>
  );
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
  const { t, language, me, myRatings, albums, liveAlbums, updateProfileName, updateProfileHandle, showScreen } = useApp();
  const [tab, setTab] = useState<ProfileTab>('ratings');

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

  const artistCount = useMemo(() => {
    const artists = new Set<string>();
    for (const r of myRatings) {
      const a = liveAlbums[r.albumId] || albums.find((x) => x.id === r.albumId);
      if (a) artists.add(a.artist);
    }
    return artists.size;
  }, [myRatings, albums, liveAlbums]);

  if (!me) return null;

  const friendsSuffix = pluralForKey(language, me.friends.length, 'profile.friendOne', 'profile.friendFew', 'profile.friendMany');
  const recentFive = [...myRatings].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  const TABS: { key: ProfileTab; label: string }[] = [
    { key: 'ratings', label: t('profile.tabRatings') },
    { key: 'reviews', label: t('profile.tabReviews') },
    { key: 'awards', label: t('profile.tabAwards') },
    { key: 'listening', label: t('profile.tabListening') },
    { key: 'friends', label: t('profile.tabFriends') },
  ];

  return (
    <>
      <ProfileBanner />
      <div className="tile t-ink hero">
        <div className="prof">
          <AvatarPicker />
          <div className="pinfo">
            <input className="pname" defaultValue={me.name} onBlur={(e) => updateProfileName(e.target.value)} />
            <div className="phandle"><input defaultValue={me.handle} onBlur={(e) => updateProfileHandle(e.target.value)} /></div>
            <p className="muted">{me.friends.length} {friendsSuffix} · {t('profile.joined')} {formatJoinDate(me.joinedAt, language)}</p>
          </div>
          <div className="pcnt">
            <div><span className="num">{me.stats.ratings}</span><small>{t('profile.ratings')}</small></div>
            <div><span className="num">{me.stats.reviews}</span><small>{t('profile.reviews')}</small></div>
            <div><span className="num">{me.friends.length}</span><small>{t('profile.friends')}</small></div>
            <div><span className="num">{artistCount}</span><small>{t('profile.artists')}</small></div>
          </div>
        </div>
        <div className="acts"><ShareProfileButton /></div>
      </div>

      <div className="bento" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
        <button className="tile" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => showScreen('history')}>
          <StarIcon /><h3 style={{ marginTop: 8 }}>{t('profile.quickHistory')}</h3>
        </button>
        <button className="tile" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => showScreen('stats')}>
          <BarsIcon /><h3 style={{ marginTop: 8 }}>{t('profile.quickStats')}</h3>
        </button>
        <button className="tile" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => showScreen('groups')}>
          <GroupsIcon /><h3 style={{ marginTop: 8 }}>{t('profile.quickGroups')}</h3>
        </button>
        <button className="tile" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => showScreen('settings')}>
          <SettingsIcon /><h3 style={{ marginTop: 8 }}>{t('profile.quickSettings')}</h3>
        </button>
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
            <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => showScreen('history')}>{t('profile.openHistoryStats')} →</button>
          </div>
          <div className="tile s2">
            <h3>{t('profile.recentRatings')}</h3>
            <div style={{ marginTop: 10 }}><RecentRatingsList ratings={recentFive} /></div>
            {me.stats.ratings > 5 && <button className="btn ghost" style={{ marginTop: 10 }} onClick={() => showScreen('history')}>{t('profile.seeAllRatings', { count: me.stats.ratings })}</button>}
          </div>
          <div className="tile">
            <h3>{t('profile.top4')}</h3>
            <div style={{ marginTop: 10 }}><Top4Grid ids={me.top4Albums} /></div>
          </div>
          <div className="tile s2">
            <h3>{t('profile.taste')}</h3>
            <div style={{ marginTop: 10 }}><TasteFingerprint entries={tasteFingerprint} /></div>
          </div>
          <div className="tile">
            <h3>{t('profile.favoriteGenres')}</h3>
            <div style={{ marginTop: 10 }}><GenresBlock genres={me.genres} /></div>
          </div>
        </div>
      )}

      {tab === 'reviews' && (
        <div className="bento b3">
          <div className="tile s3">
            <h3>{t('profile.tabReviews')}</h3>
            <div style={{ marginTop: 10 }}><MyReviewsBlock /></div>
          </div>
          <div className="tile">
            <h3>{t('profile.lovedTracks')}</h3>
            <div style={{ marginTop: 10 }}><LovedTracksBlock /></div>
            <div style={{ marginTop: 10 }}><ShareLovedTracksButton /></div>
          </div>
        </div>
      )}

      {tab === 'awards' && (
        <div className="bento b3">
          <div className="tile s3">
            <h3>{t('profile.monthAwards')}</h3>
            <div style={{ marginTop: 10 }}><AwardsBlock /></div>
          </div>
        </div>
      )}

      {tab === 'listening' && (
        <div className="bento b3">
          <div className="tile s3">
            <h3>{t('profile.tabListening')}</h3>
            <div style={{ marginTop: 10 }}><ListeningRecentBlock /></div>
          </div>
          <SettingsSummary />
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
