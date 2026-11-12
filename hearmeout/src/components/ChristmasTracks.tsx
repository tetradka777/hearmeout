'use client';

import { useApp } from '@/lib/AppContext';
import { CHRISTMAS_TRACKS } from '@/lib/christmasTracks';
import type { QueueTrack } from '@/lib/PlayerContext';
import { Shelf } from './ui/SuperCards';
import { CoverArt } from './ui/CoverArt';
import { SpotifyLogo } from './ui/Icons';
import { PreviewButton } from './redesign/PreviewButton';

// Only the fields the existing preview player needs: track IDs are never
// mistaken for album IDs, and no new Spotify lookup runs on shelf mounting.
// Each card previews one song. If it is unavailable, the global player's
// auto-skip must not look up the whole seasonal catalogue in the background.
const queues: QueueTrack[][] = CHRISTMAS_TRACKS.map(({ title, artist, cover }) => [{ title, artist, cover }]);

export function ChristmasTracks() {
  const { t } = useApp();
  return <Shelf title={t('christmas.title')} sub={t('christmas.subtitle')} className="repeat35 christmas38">
    {CHRISTMAS_TRACKS.map((track, index) => <article key={track.trackId} className="tile t-ink repeat35card christmas38card">
      <div className="repeat35body">
        <CoverArt url={track.cover} fallbackLetter={track.artist[0]} className="cov" px={80} style={{ width: 64, height: 64, flex: 'none' }} />
        <div className="repeat35text"><a href={track.url} target="_blank" rel="noopener noreferrer" className="repeat35title"><span>{track.title}</span></a><small>{track.artist}</small></div>
      </div>
      <div className="repeat35foot">
        <a href={track.url} target="_blank" rel="noopener noreferrer" className="christmas38spotify" aria-label={t('christmas.openTrack', { title: track.title })}><SpotifyLogo /><span>Spotify</span></a>
        <PreviewButton tracks={queues[index]} size={40} />
      </div>
    </article>)}
  </Shelf>;
}
