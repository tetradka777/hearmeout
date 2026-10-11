// The smallest variant of a Spotify or Deezer picture that still looks
// sharp at `cssPx` on a 2x screen. Lists used to load the 640 px album
// cover (≈125 KB) into 44 px circles; the 300 px one is ≈35 KB, 64 px ≈3 KB.
// Spotify encodes the size in the image id's prefix, Deezer in the path.
// Any other URL comes back unchanged.
const SPOTIFY_ALBUM = { 640: 'ab67616d0000b273', 300: 'ab67616d00001e02', 64: 'ab67616d00004851' } as const;
const SPOTIFY_ARTIST = { 640: 'ab6761610000e5eb', 320: 'ab67616100005174', 160: 'ab6761610000f178' } as const;
const DEEZER_SIZES = [56, 120, 250, 500, 1000];

export function sizedImage(url: string | null | undefined, cssPx: number): string | undefined {
  if (!url) return undefined;
  const target = cssPx * 2;
  const spotify = url.match(/^(https:\/\/i\.scdn\.co\/image\/)([0-9a-f]{16})([0-9a-f]+)$/);
  if (spotify) {
    const [, base, prefix, rest] = spotify;
    if ((Object.values(SPOTIFY_ALBUM) as string[]).includes(prefix)) {
      // 300 px is fine up to ~360 px on screen.
      const p = target <= 64 ? SPOTIFY_ALBUM[64] : target <= 360 ? SPOTIFY_ALBUM[300] : SPOTIFY_ALBUM[640];
      return base + p + rest;
    }
    if ((Object.values(SPOTIFY_ARTIST) as string[]).includes(prefix)) {
      const p = target <= 160 ? SPOTIFY_ARTIST[160] : target <= 320 ? SPOTIFY_ARTIST[320] : SPOTIFY_ARTIST[640];
      return base + p + rest;
    }
    return url;
  }
  const deezer = url.match(/^(https:\/\/[a-z0-9-]+\.dzcdn\.net\/images\/[a-z]+\/[0-9a-f]+\/)(\d+)x\d+(-.*)$/);
  if (deezer) {
    const size = DEEZER_SIZES.find((s) => s >= target) ?? 1000;
    return `${deezer[1]}${size}x${size}${deezer[3]}`;
  }
  return url;
}
