'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useApp } from '@/lib/AppContext';
import { usePlayer } from '@/lib/PlayerContext';
import { fmt1 } from '@/lib/numberFormat';
import { quoted } from '@/lib/i18n';
import { userAvatarStyle, formatRelative } from '@/lib/format';
import { isReviewTagId, REVIEW_TAG_LABEL_KEY } from '@/lib/reviewTags';
import { sizedImage } from '@/lib/imageSize';
import { CoverArt } from './CoverArt';
import { ArtistAvatar, ArtistName } from './ArtistName';
import { SocialBar } from './Social';
import { socialKey } from '@/lib/socialClient';

type Person = { id?: string; name: string; avatarUrl: string | null };

// The card the feed and reviews share: the palette's ink with a glow of
// the cover in one corner, who and when on top, the content, and at the
// foot comments / reactions and a round "open" button.
export function DarkCard({ cover, head, right, children, onOpen, footLeft, className = '' }: {
  cover?: string | null; head: ReactNode; right?: ReactNode; children: ReactNode; onOpen?: () => void; footLeft?: ReactNode; className?: string;
}) {
  const { t } = useApp();
  const bg = cover ? sizedImage(cover, 120) : null;
  return (
    <article className={`dkc13 ${className}`.trim()} style={bg ? ({ ['--cvbg' as string]: `url('${bg}')` } as CSSProperties) : undefined}>
      <div className="hd">{head}{right && <span className="rt">{right}</span>}</div>
      <div className="bd">{children}</div>
      {onOpen && (
        <div className="ft">
          <span className="fl">{footLeft}</span>
          <button className="op" onClick={onOpen} aria-label={t('recap.friendOpen')}><i className="ic ic-chev" aria-hidden="true" /></button>
        </div>
      )}
    </article>
  );
}

// Who and when, for the top of a dark card.
export function CardWho({ user, when, onClick }: { user: Person | Person[]; when: string; onClick?: () => void }) {
  const people = Array.isArray(user) ? user : [user];
  const inner = (
    <>
      <span className="avs">
        {people.slice(0, 2).map((p, i) => (
          <span key={p.id ?? i} className="dot" style={{ ...userAvatarStyle(p), backgroundSize: 'cover' }}>{!p.avatarUrl && p.name[0]?.toUpperCase()}</span>
        ))}
      </span>
      <span className="g"><b>{people.map((p) => p.name).join(' · ')}</b><small className="wp">{when}</small></span>
    </>
  );
  return onClick ? <button className="who13" onClick={onClick}>{inner}</button> : <span className="who13">{inner}</span>;
}

// A written review as a card: who and when, the album (the cover carries
// the score and a play button), the quote, the review's tags.
export function ReviewCard({ user, createdAt, stars, review, tags, albumId, showAlbum = true, clamp = true }: {
  user: Person; createdAt: string; stars: number; review: string | null; tags?: string[]; albumId: string; showAlbum?: boolean; clamp?: boolean;
}) {
  const { t, language, albums, liveAlbums, spotifyCovers, openAlbum, viewFriend, me } = useApp();
  const { playQueue } = usePlayer();
  const a = liveAlbums[albumId] || albums.find((x) => x.id === albumId || x.spotifyId === albumId);
  const cover = a ? spotifyCovers[a.id] || a.cover : undefined;
  const firstTrack = a?.tracklist?.[0];
  const openWho = user.id && user.id !== me?.id ? () => viewFriend(user.id!) : undefined;
  const shownTags = (tags || []).filter(isReviewTagId).slice(0, 3);
  return (
    <DarkCard
      cover={cover}
      head={<CardWho user={user} when={formatRelative(createdAt, language)} onClick={openWho} />}
      onOpen={() => openAlbum(albumId)}
      footLeft={user.id ? <SocialBar target={socialKey.review(user.id, albumId)} title={a?.title} /> : null}
    >
      {showAlbum && a && (
        <div className="alb13">
          <span className="cvb">
            <button onClick={() => openAlbum(albumId)} aria-label={a.title}>
              <CoverArt url={cover} fallbackLetter={a.artist[0] || '?'} className="cov" px={84} style={{ width: 84, height: 84 }} />
            </button>
            {firstTrack && (
              <button className="pl13" onClick={() => playQueue([{ title: firstTrack, artist: a.artist, cover: cover ?? null, albumId: a.id }], 0)} aria-label={t('album.playPreviewOf', { title: firstTrack })}>
                <i className="ic ic-play" />
              </button>
            )}
          </span>
          <span className="g">
            <button className="tt" onClick={() => openAlbum(albumId)}>{a.title}</button>
            <small><ArtistName name={a.artist} id={a.artistId} size={16} /></small>
          </span>
          <span className="scb14" aria-label={`★ ${fmt1(stars)}`}><b>{fmt1(stars)}</b><i className="ic ic-star" aria-hidden="true" /></span>
        </div>
      )}
      {!(showAlbum && a) && <span className="scl14"><i className="ic ic-star" aria-hidden="true" /> {fmt1(stars)}</span>}
      {review && <p className={`q13${clamp ? ' clamp' : ''}`}>{quoted(language, review)}</p>}
      {shownTags.length > 0 && <div className="tg13">{shownTags.map((id) => <span key={id}>{t(REVIEW_TAG_LABEL_KEY[id])}</span>)}</div>}
    </DarkCard>
  );
}

// A titled shelf of big cards you swipe through.
export function Shelf({ title, sub, right, children }: { title: string; sub?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="sh14">
      <div className="hd"><h2>{title}</h2>{right}</div>
      {sub && <p className="muted sb">{sub}</p>}
      <div className="hrow sr14">{children}</div>
    </section>
  );
}

// An album on a shelf: the cover (a rank in a circle on its corner), then
// title, artist and one more line, straight on the page.
export function AlbumShelfCard({ cover, title, artist, artistId, meta, badge, onClick }: {
  cover?: string | null; title: string; artist: string; artistId?: string | null; meta?: ReactNode; badge?: ReactNode; onClick: () => void;
}) {
  return (
    <div className="shc14">
      <button className="im" onClick={onClick} aria-label={title}>
        <CoverArt url={cover ?? undefined} fallbackLetter={artist[0] || '?'} className="cov" px={180} style={{ width: '100%', aspectRatio: '1' }} />
        {badge && <span className="bg">{badge}</span>}
      </button>
      <span className="tx">
        <button className="tt" onClick={onClick}>{title}</button>
        <small><ArtistName name={artist} id={artistId} size={16} /></small>
        {meta && <small className="mt">{meta}</small>}
      </span>
    </div>
  );
}

// An artist on a shelf: a tinted card with the round photo, the name and
// one line under it.
export function ArtistShelfCard({ name, id, photo, sub, onClick }: { name: string; id?: string | null; photo?: string | null; sub?: ReactNode; onClick: () => void }) {
  return (
    <button className="arc14" onClick={onClick}>
      <ArtistAvatar name={name} id={id} photo={photo} size={120} />
      <span className="tx"><b>{name}</b>{sub && <small>{sub}</small>}</span>
    </button>
  );
}
