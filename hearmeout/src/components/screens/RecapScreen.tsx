'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { lastSeasons } from '@/lib/seasons';
import { PlayRing } from '../redesign/PreviewButton';
import { recapColors, recapToneStyle } from '@/lib/recapTone';
import { ArtistAvatar, ArtistName } from '../ui/ArtistName';
import { fmt1, fmtHours } from '@/lib/numberFormat';
import { useApp } from '@/lib/AppContext';
import type { Device, PublicProfile, RecapData, RecapPeriod } from '@/lib/types';
import { userAvatarStyle } from '@/lib/format';
import { toLocale, type Language, type TranslationKey } from '@/lib/i18n';
import { recapLine } from '@/lib/recapLine';
import { completedWeekRange, isoWeekNumber } from '@/lib/weeks';
import { markRecapSeen } from '@/lib/recapSeen';
import { parseSeasonKey } from '@/lib/seasons';
import { drawStoryCard } from '@/lib/posterCanvas';
import { CoverArt } from '../ui/CoverArt';
import { CloseIcon } from '../ui/Icons';
import { prefetchQueueTrack, usePlayer } from '@/lib/PlayerContext';
import { SocialBar } from '../ui/Social';
import { socialKey } from '@/lib/socialClient';

// Award glyphs on the recap's pills (SVG masks, no emoji).
const RECAP_AWARD_ICON: Record<string, string> = {
  awardMostActive: 'bolt', awardNightOwl: 'moon', awardHarshestCritic: 'lens', awardGenreExplorer: 'compass',
  awardStreak: 'flame', awardScout: 'target', awardStuck: 'repeat', awardTimeTraveler: 'clock',
};

const PERIODS: RecapPeriod[] = ['week', 'month', 'season'];
const PERIOD_KEY: Record<RecapPeriod, TranslationKey> = { day: 'recap.day', week: 'recap.week', month: 'recap.month', season: 'recap.season' };


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
    setRecapPeriod, setRecapSeasonKey, setRecapOffset, openAlbum, openSpotifyArtist,
    viewFriend, openRecap, showScreen, showToast, shareRecapWithFriends,
  } = useApp();
  const { currentTrack, playing, quiet, toggle, playQueue, close } = usePlayer();
  const targetId = state.recapViewUserId === 'me' ? me?.id : state.recapViewUserId;
  const isMe = state.recapViewUserId === 'me' || (!!me && state.recapViewUserId === me.id);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const period = state.recapPeriod;
  const isSeason = period === 'season';
  const seasonKey = isSeason ? state.recapSeasonKey : null;
  const offset = isSeason ? 0 : state.recapOffset;
  // Only the last two finished seasons; opening Season picks the latest.
  const finishedSeasons = useMemo(() => lastSeasons(), []);
  useEffect(() => {
    if (isSeason && !seasonKey) setRecapSeasonKey(finishedSeasons[0].key);
  }, [isSeason, seasonKey, finishedSeasons, setRecapSeasonKey]);
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
    if (isMe || !targetId) { setProfile(null); return; }
    let cancelled = false;
    fetch(`/api/users/${targetId}`).then((res) => (res.ok ? res.json() : null)).then((data) => { if (!cancelled) setProfile(data); });
    return () => { cancelled = true; };
  }, [isMe, targetId]);

  // Opening a recap plays its song of the period (the most played track)
  // once per recap: switching period or window plays that one's song, and
  // leaving and coming back plays it again. Already playing it: left alone.
  // It plays quietly (no mini-player: the song tile has its own button) and
  // stops when you leave the recap. The preview is looked up as soon as the
  // recap is known, even while the screen is preloading hidden, so it starts
  // without a wait. A link opened cold may be blocked by the browser's
  // autoplay rule; the song tile's button then starts it.
  const autoKey = targetId ? recapKey(targetId, period, seasonKey, offset) : null;
  const autoSong = autoKey && !(isSeason && !seasonKey) && !recapLocked[autoKey] ? recapCache[autoKey]?.topSongs[0] : undefined;
  const autoplayed = useRef<string | null>(null);
  // Also your week's and month's songs (what Home and Stats open), as soon
  // as those recaps are loaded.
  const weekSong = me ? recapCache[`${me.id}:week`]?.topSongs[0] : undefined;
  const monthSong = me ? recapCache[`${me.id}:month`]?.topSongs[0] : undefined;
  useEffect(() => { if (me) { ensureRecap('me', 'week'); ensureRecap('me', 'month'); } }, [me, ensureRecap]);
  // Opening your latest week shrinks Home's recap card to one line.
  useEffect(() => {
    if (state.activeScreen === 'recap' && isMe && me && period === 'week' && offset === 0) {
      markRecapSeen(completedWeekRange(0, me.weekStart).start.toISOString().slice(0, 10));
    }
  }, [state.activeScreen, isMe, me, period, offset]);
  useEffect(() => {
    for (const s of [autoSong, weekSong, monthSong]) if (s) prefetchQueueTrack({ title: s.title, artist: s.artist, albumId: s.albumId });
  }, [autoSong, weekSong, monthSong]);
  useEffect(() => {
    if (state.activeScreen !== 'recap') {
      if (autoplayed.current && quiet) close();
      autoplayed.current = null;
      return;
    }
    if (!autoKey || !autoSong || autoplayed.current === autoKey) return;
    autoplayed.current = autoKey;
    if (currentTrack?.title === autoSong.title && currentTrack?.albumId === autoSong.albumId) return;
    playQueue([{ title: autoSong.title, artist: autoSong.artist, cover: autoSong.cover, albumId: autoSong.albumId }], 0, { quiet: true, loop: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeScreen, autoKey, autoSong]);

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
      colors: { ink: recapColors(r)[0], cream: color('--cream', '#F6EFE0'), accent: color('--acc', '#D72E33'), pop: color('--pop', '#FDEDA3') },
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
        <button className={`chip${offset === 0 ? ' on' : ''}`} onClick={() => setRecapOffset(0)}>{t('recap.lastWeek')}</button>
        <button className={`chip${offset === -1 ? ' on' : ''}`} onClick={() => setRecapOffset(-1)}>{t('recap.weekBeforeLast')}</button>
      </div>
    );
  } else if (isSeason) {
    subChips = (
        <div className="chips" role="group" aria-label={t('recap.season')}>
          {finishedSeasons.map((s) => (
            <button key={s.key} className={`chip${state.recapSeasonKey === s.key ? ' on' : ''}`} onClick={() => setRecapSeasonKey(s.key)}>
              {t(`season.${s.season}` as TranslationKey)} {s.year}
            </button>
          ))}
        </div>
      );
  } else {
    subChips = (
      <div className="chips">
        <button className={`chip${offset === -1 ? ' on' : ''}`} onClick={() => setRecapOffset(-1)}>{t('recap.lastMonth')}</button>
        <button className={`chip${offset === -2 ? ' on' : ''}`} onClick={() => setRecapOffset(-2)}>{t('recap.monthBeforeLast')}</button>
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
          <span className="num" style={{ fontSize: 54 }}><i className="ic ic-lock" /></span>
          <h3>{t('recap.lockedTitle', { name })}</h3>
          <p className="muted" style={{ fontWeight: 600 }}>{t('recap.lockedHint')}</p>
        </div>
      </>
    );
  }
  const song = r?.topSongs[0];
  const songQueue = song ? [{ title: song.title, artist: song.artist, cover: song.cover, albumId: song.albumId }] : [];
  const onSong = !!song && playing && currentTrack?.title === song.title && currentTrack?.albumId === song.albumId;
  const num = (n: number) => new Intl.NumberFormat(toLocale(language)).format(n);
  // Genres as chips that fill with their share.
  const cloud = (genres: RecapData['topGenres'], max = 6) => (
    <div className="gch14" aria-label={t('recap.topGenres')}>
      {genres.slice(0, max).map((g) => (
        <span key={g.genre} style={{ ['--w' as string]: `${Math.max(6, g.pct)}%` }}><b>{g.genre}</b><small>{g.pct}%</small></span>
      ))}
    </div>
  );
  // Viewing a friend's recap: the next friend's is one tap away.
  const nextFriend = !isMe && me.friends.length > 1 ? (() => {
    const i = me.friends.findIndex((f) => f.id === targetId);
    return me.friends[(i + 1) % me.friends.length];
  })() : null;
  const vibeTitle = line ? `${line.lead}${line.em ? ` ${line.em}` : ''}` : undefined;

  return (
    <>
      {top}
      <div className="chips" role="group" aria-label={t('recap.periodLabel')} style={{ marginTop: 8 }}>
        {PERIODS.map((p) => (
          <button key={p} className={`chip${period === p ? ' on' : ''}`} aria-pressed={period === p} onClick={() => setRecapPeriod(p)}>{t(PERIOD_KEY[p])}</button>
        ))}
      </div>
      {subChips}

      {!r || !line ? (
        <p className="muted" style={{ marginTop: 14 }}>{t('recap.loading')}</p>
      ) : (
        <div className="rcp13">
          {/* The recap as one coloured sheet (after Superfan): who and when, the
              vibe, three numbers, genres, top artists and songs, by day, awards. */}
          <section className="rsh13" style={recapToneStyle(r)} aria-label={isMe ? t(`recap.titleMe.${period}` as TranslationKey) : t(`recap.titleOf.${period}` as TranslationKey, { name })}>
            <header className="rh">
              <span className="avt" style={{ ...userAvatarStyle({ avatarUrl }), backgroundSize: 'cover' }}>{!avatarUrl && name[0]?.toUpperCase()}</span>
              <div className="g"><b>{name}</b><small>{period === 'week' ? `${t('recap.weekPill', { n: weekNumber(offset) })} · ` : ''}{range}</small></div>
              {song && (
                <button
                  className="pp13"
                  onClick={() => (onSong || (currentTrack?.title === song.title && currentTrack?.albumId === song.albumId) ? toggle() : playQueue(songQueue, 0, { loop: true }))}
                  aria-label={`${onSong ? t('player.pause') : t('player.play')} ${song.title}`}
                >
                  <PlayRing track={song} />
                  <i className={`ic ${onSong ? 'ic-pause' : 'ic-play'}`} />
                </button>
              )}
            </header>

            <div className="vb">
              <span className="vp">{t('recap.vibe')}</span>
              <h2>{line.lead}{line.em && <> <em>{line.em}</em></>}</h2>
            </div>

            <div className="st">
              <div><b>{num(r.minutes)}</b><small>{t('recap.minutesL')}</small></div>
              <div><b>{num(r.uniqueArtists)}</b><small>{t('recap.artistsL')}</small></div>
              <div><b>{num(r.trackCount)}</b><small>{t('recap.tracksL')}</small></div>
            </div>
            <p className="sm">{r.newArtists} {t('recap.newArtists')}{r.avgScore != null ? ` · ${fmt1(r.avgScore)} ${t('recap.avgScore')}` : ''}</p>

            {r.topGenres.length > 0 && cloud(r.topGenres)}

            {r.topArtists.length > 0 && (
              <div className="sc">
                <h3 className="k">{t('recap.topArtists')}</h3>
                {r.topArtists.map((a, i) => (
                  <button className="ln" key={`${a.id ?? a.name}-${i}`} onClick={() => a.id && openSpotifyArtist(a.id, a.name)} style={{ cursor: a.id ? 'pointer' : 'default' }}>
                    <span className="rk">{i + 1}</span>
                    <ArtistAvatar name={a.name} id={a.id} size={48} />
                    <span className="g"><b>{a.name}</b><span className="br"><i style={{ width: `${Math.round((a.plays / r.topArtists[0].plays) * 100)}%` }} /></span></span>
                    <span className="x">{a.plays}</span>
                  </button>
                ))}
              </div>
            )}

            {r.topSongs.length > 0 && (
              <div className="sc">
                <h3 className="k">{t('recap.topSongs')}</h3>
                {r.topSongs.map((s, i) => {
                  const album = s.albumId ? (liveAlbums[s.albumId] || albums.find((x) => x.id === s.albumId)) : undefined;
                  return (
                    <button className="ln" key={`${s.albumId ?? s.title}-${i}`} onClick={() => s.albumId && openAlbum(s.albumId)} style={{ cursor: s.albumId ? 'pointer' : 'default' }}>
                      <span className="rk">{i + 1}</span>
                      <CoverArt url={s.cover ?? undefined} fallbackLetter={s.artist[0] || '?'} className="cov" px={48} style={{ width: 48, height: 48 }} />
                      <span className="g"><b>{s.title}</b><small><ArtistName name={s.artist} id={album?.artistId} size={16} /></small></span>
                      <span className="x">{s.plays}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {r.daily && r.daily.some((m) => m > 0) && (() => {
              const days = r.daily!;
              const mx = Math.max(...days);
              const pk = days.indexOf(mx);
              const start = new Date(r.range.start);
              const dayName = (i: number, style: 'short' | 'narrow') => new Date(start.getTime() + i * 86400000).toLocaleDateString(toLocale(language), { weekday: style, timeZone: 'UTC' });
              return (
                <div className="sc">
                  <h3 className="k">{t('recap.dayByDay')} · {t('recap.busiest', { day: dayName(pk, 'short') })}</h3>
                  <div className="dy10" role="img" aria-label={t('recap.dayByDay')}>
                    {days.map((m, i) => (
                      <span key={i} className={i === pk ? 'pk' : ''}>
                        <i style={{ height: `${Math.round((m / mx) * 100)}%` }} />
                        <b>{fmtHours(Math.round((m / 60) * 10) / 10)}</b>
                        <small>{dayName(i, 'narrow')}</small>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}

            {isMe && r.awards.length > 0 && (
              <div className="sc">
                <h3 className="k">{t('recap.awardsEarned')}</h3>
                <div className="aw11">
                  {r.awards.map((a) => <span className="tag" key={a}><i className={`ic ic-${RECAP_AWARD_ICON[a] ?? 'star'}`} style={{ fontSize: 15 }} />{t(`groups.${a}` as TranslationKey)}</span>)}
                </div>
              </div>
            )}
            <div className="sft"><SocialBar target={socialKey.recap(targetId, period, r.range.start)} title={vibeTitle} /></div>
          </section>

          <div className="stack">
            {isMe && friends.length > 0 && (
              <>
                <h2 style={{ margin: '4px 0 0' }}>{t('recap.friendsRecaps')}</h2>
                {friends.map((f) => {
                  const fk = recapKey(f.id, period, seasonKey, offset);
                  const fr = recapCache[fk];
                  const text = recapLocked[fk] ? t('recap.friendPrivate') : !fr ? t('recap.loading') : !fr.trackCount ? t('recap.friendQuiet') : null;
                  return (
                    <div className={`tile rcf13 ${fr && fr.trackCount ? 't-rc' : 't-ink'}`} style={fr && fr.trackCount ? recapToneStyle(fr) : undefined} key={f.id}>
                      <button className="rh" onClick={() => openRecap(f.id)}>
                        <span className="avt" style={{ ...userAvatarStyle(f), backgroundSize: 'cover' }}>{!f.avatarUrl && f.name[0]?.toUpperCase()}</span>
                        <span className="g"><b>{f.name}</b><small>{range}</small></span>
                        {fr && fr.minutes > 0 && <span className="mp">{num(fr.minutes)} <small>{t('recap.minShort')}</small></span>}
                      </button>
                      {text ? <span className="sm">{text}</span> : fr && (() => {
                        const fl = recapLine(fr, language, t);
                        return (
                          <>
                            <span className="fv">{fl.lead}{fl.em && <> <em>{fl.em}</em></>}</span>
                            <span className="fa">
                              <span className="stk">{fr.topArtists.slice(0, 3).map((a, i) => <ArtistAvatar key={`${a.name}-${i}`} name={a.name} id={a.id} size={44} />)}</span>
                              <small>{fr.topArtists.slice(0, 3).map((a) => a.name).join(', ')}</small>
                            </span>
                          </>
                        );
                      })()}
                      <span className="ft">
                        {fr && <SocialBar target={socialKey.recap(f.id, period, fr.range.start)} title={f.name} />}
                        <button className="op" onClick={() => openRecap(f.id)}>{t('recap.friendOpen')} →</button>
                      </span>
                    </div>
                  );
                })}
              </>
            )}

            {nextFriend && (
              <button className="tile t-soft2 nx13" onClick={() => openRecap(nextFriend.id)}>
                <span className="k">{t('recap.upNext')}</span>
                <span className="rh">
                  <span className="dot" style={{ ...userAvatarStyle(nextFriend), backgroundSize: 'cover' }}>{!nextFriend.avatarUrl && nextFriend.name[0]?.toUpperCase()}</span>
                  <b>{nextFriend.name}</b>
                  <span className="ar">→</span>
                </span>
              </button>
            )}

            {isMe ? (
              <div className="acts" style={{ margin: 0 }}>
                <button className="btn lg" style={{ ['--bb' as string]: 'var(--acc)', ['--bf' as string]: 'var(--onacc)' }} onClick={shareImage}>{t('recap.shareImage')}</button>
                <button className="btn ghost lg" onClick={sendToFriends}>{t('recap.sendFriends')}</button>
                <button className="btn ghost lg" onClick={() => showScreen('stats')}>{t('recap.listeningStats')}</button>
              </div>
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
