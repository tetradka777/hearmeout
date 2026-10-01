'use client';

import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/lib/AppContext';
import { userAvatarStyle } from '@/lib/format';
import { toLocale } from '@/lib/i18n';
import { CoverArt } from './ui/CoverArt';
import { HeartIcon } from './ui/Icons';
import { Stars } from './redesign/Stars';
import type { RatingRecord } from '@/lib/types';

export function AccountBlock() {
  const { t, me, claimAccount, logout, showToast } = useApp();
  const [claiming, setClaiming] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  if (!me) return null;

  const submitClaim = async () => {
    if (!email.trim() || !password || submitting) return;
    setSubmitting(true);
    try {
      await claimAccount(email.trim(), password);
      showToast(t('profile.passwordSetSuccess'));
      setClaiming(false);
      setEmail('');
      setPassword('');
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      showToast(code === 'email_taken' ? t('profile.claimEmailTaken') : t('profile.claimFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="tile">
      <div className="setrow" style={{ border: 0, padding: 0 }}>
        <div>
          <b>{t('profile.yourId')}</b>
          <div className="muted">{me.handle}</div>
        </div>
      </div>

      {me.hasPassword ? (
        <div className="acts">
          <span className="tag">{t('profile.hasPasswordBadge')}</span>
          {me.email && <small className="muted">{t('profile.emailLabel')}: {me.email}</small>}
        </div>
      ) : claiming ? (
        <div style={{ marginTop: 14 }}>
          <p className="muted">{t('profile.passwordSetHint')}</p>
          <input type="email" className="field" style={{ width: '100%', marginBottom: 10, marginTop: 10 }} placeholder={t('register.emailPlaceholder')} value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" className="field" style={{ width: '100%', marginBottom: 10 }} placeholder={t('register.passwordPlaceholder')} value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn" style={{ width: '100%' }} disabled={submitting} onClick={submitClaim}>{t('profile.passwordSetSubmit')}</button>
        </div>
      ) : (
        <button className="btn ghost" style={{ width: '100%', marginTop: 14 }} onClick={() => setClaiming(true)}>{t('profile.passwordSetTitle')}</button>
      )}

      <button className="btn ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => logout()}>{t('profile.logout')}</button>
    </div>
  );
}

export function ConnectBlock() {
  const { t, me } = useApp();
  if (!me) return null;
  return (
    <div className="tile">
      <div className="conn">
        <a className="btn" href="/api/auth/spotify">{me.connections.spotify ? t('profile.spotifyConnected') : t('profile.connectSpotify')}</a>
        <button className="btn ghost" disabled>{t('profile.appleMusicSoon')}</button>
      </div>
      {!me.connections.spotify && <p className="muted">{t('profile.connectBetaHint')}</p>}
    </div>
  );
}

export function ImportHistoryBlock() {
  const { t, importStreamingHistory } = useApp();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async () => {
    if (!files.length || busy) return;
    setBusy(true);
    setResult(null);
    const res = await importStreamingHistory(files);
    setBusy(false);
    if (res) {
      setResult({ imported: res.imported, errors: res.errors || [] });
      setFiles([]);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="tile imp">
      <button className="btn ghost" style={{ width: '100%' }} onClick={() => setOpen((v) => !v)}>{t('profile.importTitle')}</button>
      {open && (
        <div style={{ marginTop: 14 }}>
          <p className="muted">{t('profile.importSubtitle')}</p>
          <b style={{ display: 'block', marginTop: 10 }}>{t('profile.importHowTitle')}</b>
          <ol>
            <li>{t('profile.importStep1')}</li>
            <li>{t('profile.importStep2')}</li>
            <li>{t('profile.importStep3')}</li>
            <li>{t('profile.importStep4')}</li>
            <li>{t('profile.importStep5')}</li>
          </ol>
          <input ref={inputRef} type="file" accept=".json,application/json" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} style={{ margin: '10px 0', width: '100%' }} />
          <button className="btn" style={{ width: '100%' }} disabled={!files.length || busy} onClick={submit}>{busy ? t('profile.importUploading') : t('profile.importSubmit')}</button>
          {result && (
            <div className="rep">
              {result.imported > 0 ? t('profile.importResult', { count: result.imported }) : t('profile.importResultEmpty')}
              {result.errors.length > 0 && <ul style={{ marginTop: 8, paddingLeft: 18 }}>{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function RecapOpenButton({ userId, label }: { userId: string; label: string }) {
  const { openRecap } = useApp();
  return <button className="btn ghost" onClick={() => openRecap(userId)}>🎧 {label} →</button>;
}

export function GenresBlock({ genres }: { genres: { g: string; pct: number }[] }) {
  const { t } = useApp();
  if (!genres.length) return <p className="muted">{t('profile.notEnoughData')}</p>;
  return (
    <div className="stack">
      {genres.map((g) => (
        <div className="row" key={g.g}>
          <div className="g"><b>{g.g}</b></div>
          <div className="meter"><i style={{ width: `${g.pct}%` }} /></div>
          <small className="muted">{g.pct}%</small>
        </div>
      ))}
    </div>
  );
}

export function TasteFingerprint({ entries }: { entries: { g: string; avg: number }[] }) {
  const { t } = useApp();
  if (!entries.length) return <p className="muted">{t('profile.notEnoughData')}</p>;
  return (
    <div className="bento" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
      {entries.map((e) => (
        <div className="tile" key={e.g}>
          <span className="num" style={{ fontSize: 28 }}>{e.avg.toFixed(1)}</span>
          <div className="muted">{e.g}</div>
          <div className="meter" style={{ marginTop: 8 }}><i style={{ width: `${(e.avg / 5) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

// Row-style list (cover, title/artist, date, stars) for the Profile
// screen's "ratings" tab (spec 6.8) — distinct from RecentRatingsGrid's
// cover-grid layout, used elsewhere on the same screen.
export function RecentRatingsList({ ratings }: { ratings: RatingRecord[] }) {
  const { t, language, albums, liveAlbums, spotifyCovers, openAlbum } = useApp();
  if (!ratings.length) return <p className="muted">{t('profile.noRatedAlbums')}</p>;
  return (
    <div className="stack">
      {ratings.map((r) => {
        const a = liveAlbums[r.albumId] || albums.find((x) => x.id === r.albumId);
        if (!a) return null;
        const cover = spotifyCovers[a.id] || a.cover;
        return (
          <button className="row" key={r.albumId} onClick={() => openAlbum(a.id)} style={{ cursor: 'pointer', width: '100%' }}>
            <CoverArt url={cover} fallbackLetter={a.artist[0] || '?'} className="cov" style={{ width: 40, height: 40 }} />
            <div className="g"><b>{a.title}</b><div className="muted">{a.artist} · {new Date(r.createdAt).toLocaleDateString(toLocale(language), { day: '2-digit', month: 'short' })}</div></div>
            <Stars value={r.stars} size={14} />
          </button>
        );
      })}
    </div>
  );
}

export function MyReviewsBlock() {
  const { t, language, myRatings, albums, liveAlbums, spotifyCovers, openAlbum } = useApp();
  const reviewed = myRatings.filter((r) => !!r.review);
  if (!reviewed.length) return <p className="muted">{t('profile.noReviews')}</p>;
  return (
    <div className="stack">
      {reviewed.map((r) => {
        const a = liveAlbums[r.albumId] || albums.find((x) => x.id === r.albumId);
        if (!a) return null;
        const cover = spotifyCovers[a.id] || a.cover;
        return (
          <button className="row" key={r.albumId} onClick={() => openAlbum(a.id)} style={{ cursor: 'pointer', width: '100%', alignItems: 'flex-start' }}>
            <CoverArt url={cover} fallbackLetter={a.artist[0] || '?'} className="cov" style={{ width: 40, height: 40 }} />
            <div className="g">
              <b>{a.title}</b>
              <div className="muted">{a.artist} · {new Date(r.createdAt).toLocaleDateString(toLocale(language), { day: '2-digit', month: 'short' })}</div>
              <p style={{ marginTop: 4 }}>{r.review}</p>
            </div>
            <Stars value={r.stars} size={14} />
          </button>
        );
      })}
    </div>
  );
}

export function ListeningRecentBlock() {
  const { t, language, me, lovedItems, toggleLoved } = useApp();
  const [plays, setPlays] = useState<{ title: string; artist: string; cover: string | null; playedAt: string; trackId: string | null }[] | null>(null);
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    fetch(`/api/stats?period=week&weekStart=${me.weekStart}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (!cancelled && d) setPlays(d.recentPlays); });
    return () => { cancelled = true; };
  }, [me]);
  if (plays === null) return <p className="muted">{t('stats.loading')}</p>;
  if (!plays.length) return <p className="muted">{t('profile.notEnoughData')}</p>;
  return (
    <div className="stack">
      {plays.map((p, i) => {
        const loved = lovedItems.some((li) => li.type === 'track' && li.title === p.title && li.artist === p.artist);
        return (
          <div className="row" key={i}>
            <CoverArt url={p.cover ?? undefined} fallbackLetter={p.artist[0] || '?'} className="cov" style={{ width: 36, height: 36 }} />
            <div className="g"><b>{p.title}</b><div className="muted">{p.artist} · {new Date(p.playedAt).toLocaleString(toLocale(language), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div>
            <button className={`ib love${loved ? ' on' : ''}`} onClick={() => toggleLoved('track', p.title, p.artist, p.trackId, p.cover)} aria-label={t('stats.loveTrack')}><HeartIcon /></button>
          </div>
        );
      })}
    </div>
  );
}

const LOVED_TYPE_LABEL: Record<string, string> = { track: 'profile.lovedTypeTrack', album: 'profile.lovedTypeAlbum', artist: 'profile.lovedTypeArtist' };

export function LovedTracksBlock() {
  const { t, lovedItems, toggleLoved } = useApp();
  if (!lovedItems.length) return <p className="muted">{t('profile.noLovedTracks')}</p>;
  return (
    <div className="stack">
      {lovedItems.slice(0, 10).map((li) => (
        <div className="row" key={li.id}>
          <CoverArt url={li.cover ?? undefined} fallbackLetter={(li.artist || li.title)[0] || '?'} className="cov" style={{ width: 36, height: 36 }} />
          <div className="g"><b>{li.title}</b><div className="muted">{li.artist ? `${li.artist} · ` : ''}{t(LOVED_TYPE_LABEL[li.type] as never)}</div></div>
          <button className="ib love on" onClick={() => toggleLoved(li.type, li.title, li.artist, li.itemId, li.cover)} aria-label={t('stats.loveTrack')}><HeartIcon /></button>
        </div>
      ))}
    </div>
  );
}

export function Top4Grid({ ids }: { ids: string[] }) {
  const { t, albums, liveAlbums, spotifyCovers, openAlbum } = useApp();
  if (!ids.length) return <p className="muted">{t('profile.noRatedAlbums')}</p>;
  return (
    <div className="t4">
      {ids.map((id, i) => {
        const a = liveAlbums[id] || albums.find((x) => x.id === id);
        if (!a) return null;
        const cover = spotifyCovers[a.id] || a.cover;
        return (
          <button key={id} className="cvw" onClick={() => openAlbum(a.id)} style={{ width: '100%' }}>
            <CoverArt url={cover} fallbackLetter={a.artist[0] || '?'} className="cov" style={{ width: '100%', aspectRatio: '1' }}>
              <span className="bdg">{i + 1}</span>
            </CoverArt>
          </button>
        );
      })}
    </div>
  );
}

export function FriendRequestsBlock() {
  const { t, friendRequests, respondToFriendRequest } = useApp();
  if (!friendRequests.incoming.length && !friendRequests.outgoing.length) return null;

  return (
    <div className="stack">
      {friendRequests.incoming.length > 0 && (
        <div className="tile">
          <h3>{t('friends.incomingRequests')}</h3>
          <div className="stack" style={{ marginTop: 10 }}>
            {friendRequests.incoming.map((r) => (
              <div className="row" key={r.id}>
                <div className="dot" style={userAvatarStyle(r.user)}>{r.user.name[0]}</div>
                <div className="g"><b>{r.user.name}</b><div className="muted">{r.user.handle}</div></div>
                <button className="btn" onClick={() => respondToFriendRequest(r.id, 'accept')}>{t('friends.accept')}</button>
                <button className="btn ghost" onClick={() => respondToFriendRequest(r.id, 'decline')}>{t('friends.decline')}</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {friendRequests.outgoing.length > 0 && (
        <div className="tile">
          <h3>{t('friends.outgoingRequests')}</h3>
          <div className="stack" style={{ marginTop: 10 }}>
            {friendRequests.outgoing.map((r) => (
              <div className="row" key={r.id}>
                <div className="dot" style={userAvatarStyle(r.user)}>{r.user.name[0]}</div>
                <div className="g"><b>{r.user.name}</b><div className="muted">{r.user.handle}</div></div>
                <span className="tag">{t('friends.pendingBadge')}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InviteLinkButtons() {
  const { t, me, showToast } = useApp();
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);
  if (!me) return null;

  const inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/invite/${me.id}` : '';

  const share = async () => {
    const text = t('friends.inviteLinkMessage', { name: me.name.split(' ')[0] });
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ url: inviteUrl, text }); return; } catch { /* user cancelled — fall through to copy */ }
    }
    try {
      await navigator.clipboard.writeText(`${text} ${inviteUrl}`);
      showToast(t('toast.inviteCopied'));
    } catch {
      showToast(inviteUrl);
    }
  };

  const toggleQr = async () => {
    if (showQr) { setShowQr(false); return; }
    if (!qrDataUrl) {
      setLoadingQr(true);
      const QRCode = (await import('qrcode')).default;
      const url = await QRCode.toDataURL(inviteUrl, { width: 220, margin: 1, color: { dark: '#171410', light: '#ffffff' } });
      setQrDataUrl(url);
      setLoadingQr(false);
    }
    setShowQr(true);
  };

  return (
    <>
      <div className="acts">
        <button className="btn ghost" onClick={share}>{t('friends.getInviteLink')}</button>
        <button className="btn ghost" onClick={toggleQr} disabled={loadingQr}>{t('friends.showQr')}</button>
      </div>
      {showQr && qrDataUrl && (
        <div className="qrw">
          {/* eslint-disable-next-line @next/next/no-img-element -- a locally-generated data: URI, not an external/optimizable image */}
          <img src={qrDataUrl} alt="QR code to add me as a friend" className="qr" />
          <div className="muted" style={{ marginTop: 6 }}>{t('friends.qrHint')}</div>
        </div>
      )}
    </>
  );
}

export function FriendsBlock() {
  const { t, me, viewFriend, addFriend } = useApp();
  const [handle, setHandle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  if (!me) return null;

  return (
    <div>
      <div className="stack">
        {me.friends.map((f) => (
          <div className="row" key={f.id}>
            <button className="rowlink" onClick={() => viewFriend(f.id)}>
              <div className="dot" style={userAvatarStyle(f)}>{f.name[0]}</div>
              <div className="g"><b>{f.name}</b><div className="muted">{f.handle}</div></div>
            </button>
            <button className="chip" onClick={() => viewFriend(f.id)}>{t('friends.viewProfile')}</button>
          </div>
        ))}
      </div>
      {!me.friends.length && <p className="muted">{t('friends.empty')}</p>}
      <form className="acts" onSubmit={async (e) => {
        e.preventDefault();
        if (!handle.trim() || submitting) return;
        setSubmitting(true);
        await addFriend(handle.trim());
        setSubmitting(false);
        setHandle('');
      }}>
        <input className="field" style={{ flex: 1 }} placeholder={t('friends.handlePlaceholder')} value={handle} onChange={(e) => setHandle(e.target.value)} />
        <button className="btn" type="submit" disabled={submitting}>{t('friends.add')}</button>
      </form>
      <InviteLinkButtons />
    </div>
  );
}

type Award = { name: string; value: number };

export function AwardsBlock() {
  const { t, language, me } = useApp();
  const [mostMinutes, setMostMinutes] = useState<Award | null>(null);
  const [mostNiche, setMostNiche] = useState<Award | null>(null);
  const [loading, setLoading] = useState(true);
  const lastGroupKey = useRef<string | null>(null);

  useEffect(() => {
    if (!me) return;
    const group = [{ id: me.id, name: me.name }, ...me.friends.map((f) => ({ id: f.id, name: f.name }))];
    const groupKey = group.map((p) => p.id).sort().join(',');
    if (lastGroupKey.current === groupKey) return;
    lastGroupKey.current = groupKey;

    let cancelled = false;
    setLoading(true);
    Promise.all(
      group.map(async (person) => {
        const res = await fetch(`/api/recap?period=month&userId=${person.id}`);
        if (!res.ok) return null;
        const data = await res.json();
        return { ...person, minutes: data.minutes as number, uniqueArtists: data.uniqueArtists as number };
      })
    ).then((results) => {
      if (cancelled) return;
      const valid = results.filter((r): r is NonNullable<typeof r> => r !== null && r.minutes > 0);
      if (valid.length) {
        const byMinutes = [...valid].sort((a, b) => b.minutes - a.minutes)[0];
        const byNiche = [...valid].sort((a, b) => b.uniqueArtists - a.uniqueArtists)[0];
        setMostMinutes({ name: byMinutes.name, value: byMinutes.minutes });
        setMostNiche({ name: byNiche.name, value: byNiche.uniqueArtists });
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [me]);

  if (!me) return null;
  if (!me.friends.length) return <p className="muted">{t('awards.needFriends')}</p>;
  if (loading) return <p className="muted">{t('awards.computing')}</p>;
  if (!mostMinutes || !mostNiche) return <p className="muted">{t('awards.notEnough')}</p>;

  return (
    <div className="stack">
      <div className="row"><div className="g"><b>{t('awards.mostMinutes')}</b></div><small className="muted">{mostMinutes.name} — {mostMinutes.value.toLocaleString(toLocale(language))} {t('awards.minutesShort')}</small></div>
      <div className="row"><div className="g"><b>{t('awards.mostNiche')}</b></div><small className="muted">{mostNiche.name} — {mostNiche.value} {t('awards.artistsShort')}</small></div>
    </div>
  );
}
