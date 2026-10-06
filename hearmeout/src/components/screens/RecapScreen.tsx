'use client';

import { useEffect, useState } from 'react';
import { fmt1 } from '@/lib/numberFormat';
import { useApp } from '@/lib/AppContext';
import type { Device, PublicProfile, RecapData, RecapPeriod } from '@/lib/types';
import { userAvatarStyle } from '@/lib/format';
import { toLocale, pluralForKey, type Language, type TranslationKey, quoted } from '@/lib/i18n';
import { recapLine } from '@/lib/recapLine';
import { completedWeekRange, isoWeekNumber } from '@/lib/weeks';
import { parseSeasonKey } from '@/lib/seasons';
import { drawStoryCard } from '@/lib/posterCanvas';
import { CoverArt } from '../ui/CoverArt';
import { CloseIcon } from '../ui/Icons';
import { usePlayer } from '@/lib/PlayerContext';

const PERIODS: RecapPeriod[] = ['day', 'week', 'month', 'season'];
const PERIOD_KEY: Record<RecapPeriod, TranslationKey> = { day: 'recap.day', week: 'recap.week', month: 'recap.month', season: 'recap.season' };
const WEEK_OFFSETS = [0, -1, -2, -3, -4];

function recapKey(targetId: string, period: RecapPeriod, seasonKey: string | null, offset: number): string {
  return `${targetId}:${period}${seasonKey ? ':' + seasonKey : offset ? ':' + offset : ''}`;
}

function rangeLabel(r: RecapData | undefined, period: RecapPeriod, seasonKey: string | null, language: Language, t: (k: TranslationKey) => string): string {
  const loc = toLocale(language);
  if (period === 'season' && seasonKey) {
    const parsed = parseSeasonKey(seasonKey);
    return parsed ? `${t(`season.${parsed.season}` as TranslationKey)} ${parsed.year}` : '';
  }
  if (!r) return '';
  const start = new Date(r.range.start);
  if (period === 'day') return start.toLocaleDateString(loc, { day: 'numeric', month: 'long', timeZone: 'UTC' });
  if (period === 'month') return start.toLocaleDateString(loc, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const last = new Date((r.range.end ? new Date(r.range.end).getTime() : Date.now()) - 86400000);
  const fmt = (d: Date) => d.toLocaleDateString(loc, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${fmt(start)} – ${fmt(last)}`;
}

// vRecap() in reference/app.js (spec 6.12 / 13.8): one layout for every
// period — header with the vibe pill, Day / Week / Month / Season chips
// with their sub-chips (Week 39 · latest … 35), the 4:5 story card on the
// left and the stack on the right (numbers, song of the period, tops, and
// for your own recap: awards, friends' recaps and the share actions).
export function RecapScreen(_props: { device: Device }) {
  const {
    state, t, language, me, albums, liveAlbums, ensureRecap, recapCache, recapLocked, closeRecap,
    setRecapPeriod, setRecapSeasonKey, setRecapOffset, recapSeasons, openAlbum, openSpotifyArtist,
    viewFriend, openRecap, showScreen, showToast, shareRecapWithFriends,
  } = useApp();
  const { currentTrack, playing, toggle, playQueue } = usePlayer();
  const targetId = state.recapViewUserId === 'me' ? me?.id : state.recapViewUserId;
  const isMe = state.recapViewUserId === 'me' || (!!me && state.recapViewUserId === me.id);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const period = state.recapPeriod;
  const isSeason = period === 'season';
  const seasonKey = isSeason ? state.recapSeasonKey : null;
  const offset = isSeason ? 0 : state.recapOffset;
  const friends = isMe && me ? me.friends.slice(0, 6) : [];

  useEffect(() => {
    if (!targetId || (isSeason && !seasonKey)) return;
    ensureRecap(state.recapViewUserId, period, seasonKey, offset);
  }, [state.recapViewUserId, period, seasonKey, offset, isSeason, targetId, ensureRecap]);

  // Friends' recaps: the same period and window for each friend.
  const friendIdsKey = friends.map((f) => f.id).join(',');
  useEffect(() => {
    if (state.activeScreen !== 'recap' || (isSeason && !seasonKey)) return;
    for (const id of friendIdsKey ? friendIdsKey.split(',') : []) ensureRecap(id, period, seasonKey, offset);
  }, [state.activeScreen, friendIdsKey, period, seasonKey, offset, isSeason, ensureRecap]);

  useEffect(() => {
    if (isSeason && !state.recapSeasonKey && recapSeasons?.length) setRecapSeasonKey(recapSeasons[0].key);
  }, [isSeason, state.recapSeasonKey, recapSeasons, setRecapSeasonKey]);

  useEffect(() => {
    if (isMe || !targetId) { setProfile(null); return; }
    let cancelled = false;
    fetch(`/api/users/${targetId}`).then((res) => (res.ok ? res.json() : null)).then((data) => { if (!cancelled) setProfile(data); });
    return () => { cancelled = true; };
  }, [isMe, targetId]);

  if (!targetId || !me) return <div className="tile empty"><p>{t('app.loading')}</p></div>;

  const key = recapKey(targetId, period, seasonKey, offset);
  const locked = !!recapLocked[key];
  const r = isSeason && !seasonKey ? undefined : recapCache[key];
  const name = (isMe ? me.name : profile?.name) || '';
  const avatarUrl = isMe ? me.avatarUrl : profile?.avatarUrl ?? null;
  const weekNumber = (o: number) => isoWeekNumber(completedWeekRange(o, me.weekStart).start);
  const range = rangeLabel(r, period, seasonKey, language, t);
  const line = r ? recapLine(r, language, t) : null;
  const pill = period === 'week' ? t('recap.weekPill', { n: weekNumber(offset) }) : t(PERIOD_KEY[period]).toLowerCase();
  const vibe = line ? `${line.lead}${line.em ? ' ' + line.em : ''}` : '';
  const hours = r ? Math.round(r.minutes / 60) : 0;

  const storyNumbers = r ? [
    { value: `${hours}${t('unit.h')}`, label: t('recap.listened') },
    { value: String(r.newArtists), label: t('recap.newArtists') },
    { value: r.avgScore != null ? fmt1(r.avgScore) : '—', label: t('recap.avgScore') },
    { value: String(r.awards.length), label: t('recap.awardsCount') },
  ] : [];

  // Share as image: the story card as a 4:5 PNG in the current palette —
  // the system share sheet when it takes files, a download otherwise.
  const shareImage = async () => {
    if (!r || !line) return;
    const css = getComputedStyle(document.querySelector('.rd') ?? document.documentElement);
    const color = (v: string, fallback: string) => css.getPropertyValue(v).trim() || fallback;
    const canvas = document.createElement('canvas');
    drawStoryCard(canvas, {
      pill, lead: line.lead, emphasis: line.em, numbers: storyNumbers,
      colors: { ink: color('--ink', '#294074'), cream: color('--cream', '#F6EFE0'), accent: color('--acc', '#D72E33'), pop: color('--pop', '#FDEDA3') },
    });
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) return;
    const file = new File([blob], `hearmeout-recap-${period}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; } catch { /* cancelled, fall back to download */ }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    showToast(t('recap.imageSaved'));
  };

  // Send to friends: an in-app notification to every friend that opens this
  // recap (same period and window) — migration 021.
  const sendToFriends = () => { shareRecapWithFriends(period, offset); };

  let subChips = null;
  if (period === 'week') {
    subChips = (
      <div className="chips" role="group" aria-label={t('recap.week')}>
        {WEEK_OFFSETS.map((o) => (
          <button key={o} className={`chip${offset === o ? ' on' : ''}`} onClick={() => setRecapOffset(o)}>
            {t(o === 0 ? 'recap.weekChipLatest' : 'recap.weekChip', { n: weekNumber(o) })}
          </button>
        ))}
      </div>
    );
  } else if (isSeason) {
    subChips = recapSeasons === null ? <p className="muted">{t('recap.loading')}</p>
      : recapSeasons.length ? (
        <div className="chips" role="group" aria-label={t('recap.season')}>
          {recapSeasons.map((s) => (
            <button key={s.key} className={`chip${state.recapSeasonKey === s.key ? ' on' : ''}`} onClick={() => setRecapSeasonKey(s.key)}>
              {t(`season.${s.season}` as TranslationKey)} {s.year}
            </button>
          ))}
        </div>
      ) : <p className="muted">{t('recap.noData')}</p>;
  } else {
    subChips = (
      <div className="chips">
        <button className={`chip${offset === 0 ? ' on' : ''}`} onClick={() => setRecapOffset(0)}>{t(period === 'day' ? 'recap.today' : 'recap.thisMonth')}</button>
        <button className={`chip${offset === -1 ? ' on' : ''}`} onClick={() => setRecapOffset(-1)}>{t(period === 'day' ? 'recap.yesterday' : 'recap.lastMonth')}</button>
      </div>
    );
  }

  const top = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <button className="crumb" onClick={closeRecap}>‹ {isMe ? t('nav.home') : name}</button>
      <button className="ib" onClick={closeRecap} aria-label={t('recap.close')}><CloseIcon /></button>
    </div>
  );
  if (locked) {
    return (
      <>
        {top}
        <div className="tile t-soft2 empty" style={{ marginTop: 12 }}>
          <span className="num" style={{ fontSize: 54 }}>🔒</span>
          <h3>{t('recap.lockedTitle', { name })}</h3>
          <p className="muted" style={{ fontWeight: 600 }}>{t('recap.lockedHint')}</p>
        </div>
      </>
    );
  }
  const song = r?.topSongs[0];
  const songQueue = song ? [{ title: song.title, artist: song.artist, cover: song.cover, albumId: song.albumId }] : [];
  const onSong = !!song && playing && currentTrack?.title === song.title && currentTrack?.albumId === song.albumId;

  return (
    <>
      {top}
      <p className="eyebrow muted" style={{ marginTop: 8 }}>
        {period === 'week' ? t(me.weekStart === 'sun' ? 'recap.generatedSun' : 'recap.generatedMon', { range }) : range}
      </p>
      <h1 className="big">{isMe ? t(`recap.titleMe.${period}` as TranslationKey) : t(`recap.titleOf.${period}` as TranslationKey, { name })}</h1>

      <div className="rhead">
        <span className="avt" style={userAvatarStyle({ avatarUrl })}>{name[0]?.toUpperCase()}</span>
        <div><b>{name}</b><br /><small className="muted" style={{ fontWeight: 700 }}>{range}</small></div>
        {vibe && r && r.trackCount > 0 && <span className="vibe">{vibe}</span>}
      </div>

      <div className="chips" role="group" aria-label={t('recap.periodLabel')}>
        {PERIODS.map((p) => (
          <button key={p} className={`chip${period === p ? ' on' : ''}`} aria-pressed={period === p} onClick={() => setRecapPeriod(p)}>{t(PERIOD_KEY[p])}</button>
        ))}
      </div>
      {subChips}

      {!r || !line ? (
        <p className="muted" style={{ marginTop: 14 }}>{t('recap.loading')}</p>
      ) : (
        <div className="two" style={{ alignItems: 'start' }}>
          <div className="story">
            <span className="pill" style={{ alignSelf: 'flex-start' }}>{pill}</span>
            <q>{line.lead}{line.em && <> <em>{line.em}</em></>}</q>
            <div className="four">
              {storyNumbers.map((n) => <div key={n.label}><b>{n.value}</b><small>{n.label}</small></div>)}
            </div>
          </div>

          <div className="stack">
            <div className="g2">
              <div className="tile t-pop"><span className="num" style={{ fontSize: 40 }}>{r.minutes.toLocaleString(toLocale(language))}</span><br /><small style={{ fontWeight: 700 }}>{t('recap.minutesL')}</small></div>
              <div className="tile t-ink"><span className="num" style={{ fontSize: 40 }}>{r.uniqueArtists}</span><br /><small style={{ fontWeight: 700 }}>{t('recap.uniqueArtists')}</small></div>
              <div className="tile"><span className="num" style={{ fontSize: 40, color: 'var(--acct)' }}>{r.topGenres.length}</span><br /><small className="muted" style={{ fontWeight: 700 }}>{t('recap.genresL')}</small></div>
              <div className="tile t-soft2"><span className="num" style={{ fontSize: 40 }}>{r.trackCount}</span><br /><small style={{ fontWeight: 700 }}>{t('recap.playsL')}</small></div>
            </div>

            {r.topSongs[0] && (
              <div className="tile t-ac" style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <CoverArt url={r.topSongs[0].cover ?? undefined} fallbackLetter={r.topSongs[0].artist[0] || '?'} className="cov" style={{ width: 72, height: 72 }} />
                <button style={{ flex: 1, minWidth: 0, textAlign: 'left' }} onClick={() => r.topSongs[0].albumId && openAlbum(r.topSongs[0].albumId)}>
                  <small style={{ fontWeight: 800 }}>{t(`recap.songOf.${period}` as TranslationKey)}</small>
                  <h3>{r.topSongs[0].title}</h3>
                  <p style={{ fontWeight: 600 }}>{r.topSongs[0].artist}</p>
                </button>
                <button
                  className="play"
                  onClick={() => (onSong || (currentTrack?.title === song!.title && currentTrack?.albumId === song!.albumId) ? toggle() : playQueue(songQueue, 0))}
                  aria-label={`${onSong ? t('player.pause') : t('player.play')} ${song!.title}`}
                >
                  {onSong ? '❚❚' : '▶'}
                </button>
              </div>
            )}

            <div className="tile">
              <h2>{t('recap.topArtists')}</h2>
              {r.topArtists.length ? r.topArtists.map((a, i) => (
                <button className="row" key={`${a.id ?? a.name}-${i}`} onClick={() => a.id && openSpotifyArtist(a.id, a.name)} style={{ cursor: a.id ? 'pointer' : 'default' }}>
                  <span className="num" style={{ fontSize: 24, width: 20 }}>{i + 1}</span>
                  <b className="g">{a.name}</b>
                  <span className="muted" style={{ fontWeight: 800 }}>{t('stats.playsCount', { count: a.plays, word: pluralForKey(language, a.plays, 'stats.playOne', 'stats.playFew', 'stats.playMany') })}</span>
                </button>
              )) : <p className="muted">{t('recap.noData')}</p>}
            </div>

            <div className="tile t-soft2">
              <h2>{t('recap.topSongs')}</h2>
              {r.topSongs.length ? r.topSongs.map((s, i) => {
                const album = s.albumId ? (liveAlbums[s.albumId] || albums.find((x) => x.id === s.albumId)) : undefined;
                return (
                  <button className="row" key={`${s.albumId ?? s.title}-${i}`} onClick={() => s.albumId && openAlbum(s.albumId)} style={{ cursor: s.albumId ? 'pointer' : 'default' }}>
                    <span className="num" style={{ fontSize: 24, width: 20 }}>{i + 1}</span>
                    <span className="g"><b>{s.title}</b><small className="muted" style={{ fontWeight: 600 }}>{s.artist}{album ? ` · ${album.title}` : ''}</small></span>
                    <span className="muted" style={{ fontWeight: 800 }}>{s.plays}</span>
                  </button>
                );
              }) : <p className="muted">{t('recap.noData')}</p>}
            </div>

            <div className="tile">
              <h2>{t('recap.topGenres')}</h2>
              {r.topGenres.length ? (
                <div className="chips" style={{ margin: 0 }}>
                  {r.topGenres.map((g, i) => <span className={`chip${i === 0 ? ' on' : ''}`} key={g.genre}>{g.genre} · {g.pct}%</span>)}
                </div>
              ) : <p className="muted">{t('recap.noData')}</p>}
            </div>

            {isMe ? (
              <>
                <div className="tile t-soft2">
                  <h2>{t('recap.awardsEarned')}</h2>
                  <div className="chips" style={{ margin: 0 }}>
                    {r.awards.length
                      ? r.awards.map((a) => <span className="chip on" key={a}>{t(`groups.${a}` as TranslationKey)}</span>)
                      : <span className="muted" style={{ fontWeight: 600 }}>{t('recap.noAwards')}</span>}
                  </div>
                </div>

                {friends.length > 0 && (
                  <div className="tile">
                    <h2>{t('recap.friendsRecaps')}</h2>
                    {friends.map((f) => {
                      const fk = recapKey(f.id, period, seasonKey, offset);
                      const fr = recapCache[fk];
                      const fLine = fr ? recapLine(fr, language, t) : null;
                      const text = recapLocked[fk] ? t('recap.friendPrivate') : !fr ? t('recap.loading') : fr.trackCount ? quoted(language, `${fLine!.lead}${fLine!.em ? ' ' + fLine!.em : ''}`) : t('recap.friendQuiet');
                      return (
                        <button className="row" key={f.id} onClick={() => openRecap(f.id)}>
                          <span className="dot" style={userAvatarStyle(f)}>{!f.avatarUrl && f.name[0]}</span>
                          <span className="g"><b>{f.name}</b><small className="muted" style={{ fontWeight: 600 }}>{text}</small></span>
                          <span className="tag">{t('recap.friendOpen')}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="acts" style={{ margin: 0 }}>
                  <button className="btn lg" style={{ ['--bb' as string]: 'var(--acc)', ['--bf' as string]: 'var(--onacc)' }} onClick={shareImage}>{t('recap.shareImage')}</button>
                  <button className="btn ghost lg" onClick={sendToFriends}>{t('recap.sendFriends')}</button>
                  <button className="btn ghost lg" onClick={() => showScreen('stats')}>{t('recap.listeningStats')}</button>
                </div>
              </>
            ) : (
              <div className="acts" style={{ margin: 0 }}>
                <button className="btn lg" onClick={() => viewFriend(targetId)}>{t('recap.viewProfileOf', { name })}</button>
                <button className="btn ghost lg" onClick={() => openRecap('me')}>{t('recap.myRecap')}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
