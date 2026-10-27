'use client';

import { useApp } from '@/lib/AppContext';
import { useAlbums } from '@/lib/useAlbum';
import { useSwipeDeck } from '@/lib/useSwipeDeck';
import { blurStyle } from '@/lib/imageColor';
import { sizedImage } from '@/lib/imageSize';
import { fmtHours } from '@/lib/numberFormat';
import { shortTitle, userAvatarStyle } from '@/lib/format';
import { pluralForKey } from '@/lib/i18n';
import type { ApiUser, GroupLeaderboardPeriod, GroupVoteState } from '@/lib/types';
import { CoverArt } from './ui/CoverArt';
import { ArtistName } from './ui/ArtistName';
import { LeaderboardTile } from './ui/Podium';

const Face = ({ u }: { u: { name: string; avatarUrl: string | null } }) => (
  <span className="dot" style={{ ...userAvatarStyle(u), backgroundSize: 'cover' }}>{!u.avatarUrl && u.name[0]?.toUpperCase()}</span>
);

// The album-of-the-month vote, made like "picks from friends": one candidate
// at a time over its blurred cover — swipe the cover or tap the dots — with
// its votes, the faces of the members who voted for it and the vote button.
export function GroupVoteCard({ vote, title, ends, onVote }: {
  vote: GroupVoteState;
  title: string;
  ends: string;
  onVote: (albumId: string) => void;
}) {
  const { t, language, openAlbum, spotifyCovers } = useApp();
  const known = useAlbums(vote.candidates.map((c) => c.albumId));
  const deck = useSwipeDeck(known.length);
  const total = vote.candidates.reduce((s, c) => s + c.count, 0);

  const head = (
    <div className="hd">
      <h2>{title}</h2>
      <small className="muted">{ends}</small>
    </div>
  );
  if (!vote.candidates.length) {
    return (
      <section className="sh14 gv22">
        {head}
        <div className="tile t-ink glow"><p className="muted" style={{ fontWeight: 600, margin: 0 }}>{t('groups.noCandidates')}</p></div>
      </section>
    );
  }
  if (!known.length) return <section className="sh14 gv22">{head}<div className="tile t-ink glow crd0" /></section>;

  const { i, many, show } = deck;
  const { id, album } = known[i];
  const c = vote.candidates.find((x) => x.albumId === id)!;
  const cover = spotifyCovers[album.id] || album.cover;
  const voters: ApiUser[] = c.voters ?? [];
  const mine = vote.myVote === id;
  const pct = total ? Math.round((c.count / total) * 100) : 0;
  const lead = c.count > 0 && vote.candidates.every((x) => x.count <= c.count);
  const who = !voters.length ? t('groups.noVotesYet')
    : voters.length === 1 ? t('groups.votedBy', { name: voters[0].name })
    : t('groups.votedByMany', { name: voters[0].name, n: voters.length - 1 });

  return (
    <section className="sh14 fp20 gv22">
      {head}
      <div className="tile bh15 crd" style={blurStyle(cover ? sizedImage(cover, 150) ?? cover : null)}>
        <div key={id} className={deck.inClass} style={deck.inStyle}>
          <div className="l">
            <button className={`cv${many ? ' sw' : ''}`} aria-label={album.title} {...deck.handlers} onClick={() => { if (deck.tapped()) openAlbum(album.id); }}>
              <CoverArt url={cover} fallbackLetter={album.artist[0] || '?'} className="cov" px={300} style={{ width: '100%', height: '100%' }} />
            </button>
            <button className="tt" onClick={() => openAlbum(album.id)}>{shortTitle(album.title)}</button>
            <span className="ar"><ArtistName name={album.artist} id={album.artistId} size={15} /></span>
          </div>
          <div className="r">
            <span className="sc">{pct}%</span>
            <small className="cnt">
              {lead && <><i className="ic ic-medal" aria-hidden="true" /> </>}
              {t('groups.voteCount', { count: c.count, word: pluralForKey(language, c.count, 'groups.voteOne', 'groups.voteFew', 'groups.voteMany') })}
            </small>
            {voters.length > 0 && (
              <span className="fans" aria-hidden="true">{voters.slice(0, 4).map((u) => <Face key={u.id} u={u} />)}</span>
            )}
            <small className="who">{who}</small>
            <button className={`vb22${mine ? ' on' : ''}`} aria-pressed={mine} onClick={() => onVote(id)}>
              {mine ? <><i className="ic ic-check" aria-hidden="true" /> {t('groups.yourVote')}</> : t('groups.voteBtn')}
            </button>
          </div>
        </div>
        {many && (
          <div className="pnv dots" role="group" aria-label={title}>
            {known.map((k, n) => <button key={k.id} className={n === i ? 'on' : ''} aria-label={`${n + 1}`} aria-current={n === i} onClick={() => show(n, n > i ? 'up' : 'down')} />)}
          </div>
        )}
      </div>
    </section>
  );
}

// "Who listened most" as a row of columns, one per member: the height is
// their hours against the leader's, the hours on top, the face and name
// under it; the leader's column is solid, yours is ringed.
export function GroupListenRace({ rows, period, onPeriod, meId, onOpen }: {
  rows: { user: ApiUser; hours: number }[];
  period: GroupLeaderboardPeriod;
  onPeriod: (p: GroupLeaderboardPeriod) => void;
  meId: string;
  onOpen: (id: string) => void;
}) {
  const { t } = useApp();
  const max = Math.max(0, ...rows.map((r) => r.hours));
  const total = rows.reduce((s, r) => s + r.hours, 0);
  return (
    <section className="sh14 lr22">
      <div className="hd">
        <h2>{t('groups.leaderboard')}</h2>
        <div className="chips" style={{ margin: 0 }} role="group" aria-label={t('recap.periodLabel')}>
          <button className={`chip${period === 'week' ? ' on' : ''}`} onClick={() => onPeriod('week')}>{t('stats.thisWeek')}</button>
          <button className={`chip${period === 'month' ? ' on' : ''}`} onClick={() => onPeriod('month')}>{t('stats.thisMonth')}</button>
        </div>
      </div>
      <LeaderboardTile className="crd" people={rows.slice(0, 3).map((r) => r.user)}>
        <p className="tot"><b>{fmtHours(total)}{t('unit.h')}</b> {t('groups.togetherHours')}</p>
        <div className="eq" role="list">
          {rows.map((r, n) => {
            const you = r.user.id === meId;
            const lead = n === 0 && r.hours > 0;
            const h = max ? Math.max(4, Math.round((r.hours / max) * 100)) : 4;
            return (
              <button
                key={r.user.id}
                role="listitem"
                className={`c${lead ? ' lead' : ''}${you ? ' you' : ''}`}
                onClick={you ? undefined : () => onOpen(r.user.id)}
                aria-label={`${n + 1}. ${r.user.name} · ${fmtHours(r.hours)}${t('unit.h')}`}
              >
                <span className="h">{lead && <i className="ic ic-medal" aria-hidden="true" />}{fmtHours(r.hours)}{t('unit.h')}</span>
                <span className="bar"><i style={{ height: `${h}%` }} /></span>
                <Face u={r.user} />
                <small>{r.user.name}</small>
              </button>
            );
          })}
        </div>
      </LeaderboardTile>
    </section>
  );
}
