'use client';

import { Children, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useApp } from '@/lib/AppContext';
import { usePlayer } from '@/lib/PlayerContext';
import { fmt1 } from '@/lib/numberFormat';
import { quoted } from '@/lib/i18n';
import { userAvatarStyle, formatRelative, shortTitle } from '@/lib/format';
import { isReviewTagId, REVIEW_TAG_LABEL_KEY } from '@/lib/reviewTags';
import { sizedImage } from '@/lib/imageSize';
import { CoverArt } from './CoverArt';
import { PlayRing } from '../redesign/PreviewButton';
import { ArtistAvatar, ArtistName } from './ArtistName';
import { blurStyle } from '@/lib/imageColor';
import { useArtistPhoto } from '@/lib/artistPhotos';
import { SocialBar } from './Social';
import { socialKey } from '@/lib/socialClient';

type Person = { id?: string; name: string; avatarUrl: string | null };

// The card the feed and reviews share: the palette's ink with a glow of
// the cover in one corner, who and when on top, the content, and at the
// foot comments / reactions and a round "open" button.
export function DarkCard({ cover, head, right, children, onOpen, footLeft, className = '', openText, aside, extra }: {
  cover?: string | null; head: ReactNode; right?: ReactNode; children: ReactNode; onOpen?: () => void; footLeft?: ReactNode; className?: string;
  // "open →" as words (the review card) instead of the round button.
  openText?: boolean;
  // A big framed cover on the right, beside who and the text (feed cards),
  // and a full-width part under both (a quote).
  aside?: ReactNode; extra?: ReactNode;
}) {
  const { t } = useApp();
  const bg = cover ? sizedImage(cover, 150) : null;
  return (
    <article
      className={`dkc13 ${aside ? 'has-asd ' : ''}${onOpen ? 'tap ' : ''}${className}`.trim()}
      style={bg ? ({ ['--cvbg' as string]: `url('${bg}')` } as CSSProperties) : undefined}
      // The whole card opens it; its own buttons and links (and windows
      // opened from it, which aren't inside it on the page) do their own thing.
      onClick={onOpen ? (e) => {
        const el = e.target as HTMLElement;
        if (!e.currentTarget.contains(el) || el.closest('button, a, input, textarea, [role=link], [role=button]')) return;
        onOpen();
      } : undefined}
    >
      <div className="hd">{head}{right && <span className="rt">{right}</span>}</div>
      <div className="bd">{children}</div>
      {aside && <div className="asd">{aside}</div>}
      {extra && <div className="ex">{extra}</div>}
      {onOpen && (
        <div className="ft">
          <span className="fl">{footLeft}</span>
          {openText
            ? <button className="op txt" onClick={onOpen}>{t('recap.friendOpen')} →</button>
            : <button className="op" onClick={onOpen} aria-label={t('recap.friendOpen')}><i className="ic ic-chev" aria-hidden="true" /></button>}
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

// A written review as a card (the earlier, darker layout the user prefers):
// the cover blurred behind it, who and when with the score, the album with
// its whole cover and whole title and a play button, the quote, the tags.
export function ReviewCard({ user, createdAt, stars, review, tags, albumId, showAlbum = true, clamp = true }: {
  user: Person; createdAt: string; stars: number; review: string | null; tags?: string[]; albumId: string; showAlbum?: boolean; clamp?: boolean;
}) {
  const { t, language, albums, liveAlbums, spotifyCovers, openAlbum, viewFriend, me } = useApp();
  const a = liveAlbums[albumId] || albums.find((x) => x.id === albumId || x.spotifyId === albumId);
  const cover = a ? spotifyCovers[a.id] || a.cover : undefined;
  const firstTrack = a?.tracklist?.[0];
  const openWho = user.id && user.id !== me?.id ? () => viewFriend(user.id!) : undefined;
  const shownTags = (tags || []).filter(isReviewTagId).slice(0, 3);
  return (
    <DarkCard
      cover={cover}
      head={<CardWho user={user} when={formatRelative(createdAt, language)} onClick={openWho} />}
      right={<b className="sc13">★ {fmt1(stars)}</b>}
      onOpen={() => openAlbum(albumId)}
      openText
      className={clamp ? 'rvc15' : 'rvc15 full'}
      footLeft={user.id ? <SocialBar target={socialKey.review(user.id, albumId)} title={a?.title} /> : null}
    >
      {showAlbum && a && (
        <div className="alb13">
          <button className="cvb" onClick={() => openAlbum(albumId)} aria-label={a.title}>
            <CoverArt url={cover} fallbackLetter={a.artist[0] || '?'} className="cov" px={60} style={{ width: 60, height: 60 }} />
          </button>
          <span className="g">
            <button className="tt" onClick={() => openAlbum(albumId)} aria-label={a.title}><span>{shortTitle(a.title)}</span></button>
            <small><ArtistName name={a.artist} id={a.artistId} size={16} /></small>
          </span>
          {firstTrack && <ReviewPlay title={firstTrack} artist={a.artist} cover={cover ?? null} albumId={a.id} tracks={a.tracklist ?? []} />}
        </div>
      )}
      {review && <p className={`q13${clamp ? ' clamp' : ''}`}>{quoted(language, review)}</p>}
      {shownTags.length > 0 && <div className="tg13">{shownTags.map((id) => <span key={id}>{t(REVIEW_TAG_LABEL_KEY[id])}</span>)}</div>}
    </DarkCard>
  );
}

// The review card's play button: the album from its first song (so the bar
// can swipe on through it), pause while it plays, and the progress ring
// around it.
function ReviewPlay({ title, artist, cover, albumId, tracks }: { title: string; artist: string; cover: string | null; albumId: string; tracks: string[] }) {
  const { t } = useApp();
  const { playQueue, currentTrack, playing, toggle } = usePlayer();
  const isCurrent = currentTrack?.title === title && currentTrack?.albumId === albumId;
  const list = (tracks.length ? tracks : [title]).map((x) => ({ title: x, artist, cover, albumId }));
  return (
    <button
      className={`pl13${isCurrent && playing ? ' on' : ''}`}
      onClick={() => (isCurrent ? toggle() : playQueue(list, 0))}
      aria-label={isCurrent && playing ? t('player.pausePreview') : t('album.playPreviewOf', { title })}
    >
      <PlayRing track={{ title, albumId }} />
      <i className={`ic ${isCurrent && playing ? 'ic-pause' : 'ic-play'}`} />
    </button>
  );
}

// A titled shelf of big cards you swipe through.
// With `onMore` the shelf is endless: it's called whenever the end of the
// row comes near (scrolling sideways), until `done`.
export function Shelf({ title, sub, right, top, children, onMore, done = true, className = '' }: {
  title: string; sub?: ReactNode; right?: ReactNode; top?: ReactNode; children: ReactNode; onMore?: () => void; done?: boolean; className?: string;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLSpanElement | null>(null);
  const moreRef = useRef(onMore);
  useEffect(() => { moreRef.current = onMore; });
  const endless = !!onMore && !done;
  // Re-observed after each page, so a short page that leaves the end in view
  // still asks for the next one.
  const count = Children.count(children);
  useEffect(() => {
    const row = rowRef.current;
    const end = endRef.current;
    if (!endless || !row || !end || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      // A row with no width (a hidden screen) would count as "at the end".
      if (row.clientWidth > 0 && entries.some((e) => e.isIntersecting)) moreRef.current?.();
    }, { root: row, rootMargin: '0px 900px 0px 900px' });
    io.observe(end);
    return () => io.disconnect();
  }, [endless, count]);
  return (
    <section className={`sh14 ${className}`.trim()}>
      <div className="hd"><h2>{title}</h2>{right}</div>
      {sub && <p className="muted sb">{sub}</p>}
      {top}
      <div className="hrow sr14" ref={rowRef}>
        {children}
        {endless && <span className="sn15" ref={endRef} aria-hidden="true"><span className="spin15" /></span>}
      </div>
    </section>
  );
}

export function AlbumShelfCard({ cover, title, artist, artistId, meta, badge, onClick }: {
  cover?: string | null; title: string; artist: string; artistId?: string | null; meta?: ReactNode; badge?: ReactNode; onClick: () => void;
}) {
  // The cover is the card: the title and artist sit on its lower part over a
  // dark fade, the place (#1) in a small pill above them.
  return (
    <div className="ab23">
      <button className="im" onClick={onClick} aria-label={title}>
        <CoverArt url={cover ?? undefined} fallbackLetter={artist[0] || '?'} className="cov" px={200} />
      </button>
      <span className="tx">
        {badge && <span className="bg">{badge}</span>}
        <button className="tt" onClick={onClick}>{title}</button>
        <small><ArtistName name={artist} id={artistId} size={16} /></small>
        {meta && <small className="mt">{meta}</small>}
      </span>
    </div>
  );
}

// An artist on a shelf: the photo fills the top, the name and one line
// below it over the same photo blurred and darkened. `action`: a round
// button on the photo's corner (joining a fan club).
export function ArtistShelfCard({ name, id, photo: known, sub, onClick, action }: { name: string; id?: string | null; photo?: string | null; sub?: ReactNode; onClick: () => void; action?: ReactNode }) {
  const looked = useArtistPhoto(name, false, id);
  const photo = known || looked || null;
  return (
    <div className="ac23" style={blurStyle(photo)}>
      <div className="apw">
        <button className="ap" onClick={onClick} aria-label={name}>
          <ArtistAvatar name={name} id={id} photo={photo} size={200} />
        </button>
        {action && <span className="aa">{action}</span>}
      </div>
      <button className="at" onClick={onClick} tabIndex={-1} aria-hidden="true">
        <b>{name}</b>{sub && <small>{sub}</small>}
      </button>
    </div>
  );
}
