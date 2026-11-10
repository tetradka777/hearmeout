import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { deezerArtistByName, deezerArtistFor, deezerArtistIdForName } from './deezerServer';
import { popularArtists, topArtistsOf } from './tickerNews';
import { resolveSpotifyAlbumId, resolveSpotifyArtistId } from './spotifyCatalog';
import { ALBUMS } from './data';
import { artistPhotoFor } from './artistPhotoServer';
import { rankListeningArtists } from './artistIdentity';
import { releaseNameKey } from './format';

// Replace only the network boundary. The real cache, Supabase query builder,
// artist matching and release-source selection all run without a live database.
const originalFetch = globalThis.fetch;
const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
let respond: (url: URL) => unknown = () => { throw new Error('Unexpected upstream request'); };
let plays: { artist: string; artist_id: string | null; duration_ms: number }[] = [];
const cache = new Map<string, unknown>();

before(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://artist-identity-test.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'artist-identity-test.invalid') {
      if (url.pathname === '/rest/v1/listening_events') return Response.json(plays);
      assert.equal(url.pathname, '/rest/v1/spotify_cache');
      if (init?.method === 'POST') {
        const row = JSON.parse(String(init.body)) as { key: string; payload: unknown };
        cache.set(row.key, row.payload);
        return new Response(null, { status: 201 });
      }
      const key = (url.searchParams.get('key') || '').replace(/^eq\./, '');
      return Response.json(cache.has(key) ? { payload: cache.get(key), expires_at: '2099-01-01T00:00:00Z' } : null);
    }
    if (url.hostname === 'accounts.spotify.com') return Response.json({ access_token: 'test-token', expires_in: 3600 });
    const result = respond(url);
    return result instanceof Response ? result : Response.json(result);
  };
});

after(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
});

test('release artists retain commas in listening history and the popular catalog', async () => {
  plays = [
    { artist: 'Tyler, The Creator', artist_id: null, duration_ms: 3000 },
    { artist: 'Earth, Wind & Fire', artist_id: null, duration_ms: 2000 },
    { artist: 'Tyler', artist_id: null, duration_ms: 1000 },
  ];
  const admin = createClient('https://artist-identity-test.invalid', 'test-only-key');
  assert.deepEqual(await topArtistsOf(admin, 'test-user', 10), ['Tyler, The Creator', 'Earth, Wind & Fire', 'Tyler']);
});

test('popular artist selection retains commas in catalog names', () => {
  const album = ALBUMS.find((a) => a.id === 'flower-boy')!;
  const oldRank = album.popularRank;
  try {
    album.popularRank = 1;
    assert.ok(popularArtists(500).includes('Tyler, The Creator'));
    assert.ok(!popularArtists(500).includes('Tyler'));
  } finally { album.popularRank = oldRank; }
});

test('album search does not accept a comma fragment as the requested artist', async () => {
  respond = (url) => {
    assert.equal(url.pathname, '/v1/search');
    return { albums: { items: [
      { id: 'wrong-artist-album', name: 'New release', artists: [{ id: 'tyler-id', name: 'Tyler' }] },
      { id: 'correct-artist-album', name: 'New release', artists: [{ id: 'creator-id', name: 'Tyler, The Creator' }] },
    ] } };
  };
  assert.equal(await resolveSpotifyAlbumId('New release', 'Tyler, The Creator'), 'correct-artist-album');
});

test('Spotify artist resolution refuses ambiguous exact names', async () => {
  respond = () => ({ artists: { items: [{ id: 'one', name: 'Namesake' }, { id: 'two', name: 'Namesake' }] } });
  assert.equal(await resolveSpotifyArtistId('Namesake'), null);
});

test('Deezer artist identity keeps artist suffixes instead of normalizing them as album editions', async () => {
  respond = () => ({ data: [{ id: 101, name: 'The Example', nb_fan: 500, picture_medium: 'wrong.jpg' }] });
  assert.equal((await deezerArtistByName('The Example (Live)'))?.exact, false);
});

test('a common album title does not choose between equally matching Deezer namesakes', async () => {
  respond = (url) => url.pathname === '/search/artist'
    ? { data: [{ id: 201, name: 'Shared Name', nb_fan: 500 }, { id: 202, name: 'Shared Name', nb_fan: 10 }] }
    : { data: [{ title: 'Home' }] };
  assert.equal(await deezerArtistFor('ambiguous-album-test', 'Shared Name', ['Home']), null);
});

test('Deezer identities require namesake evidence beyond the first five search hits', async () => {
  respond = (url) => ({ data: Array.from({ length: 6 }, (_, i) => ({ id: 301 + i, name: i === 0 || i === 5 ? 'Buried Namesake' : `Different ${i}` })).slice(0, Number(url.searchParams.get('limit'))) });
  assert.equal((await deezerArtistByName('Buried Namesake'))?.namesakes, 2);
});

test('artist ranking preserves primary Spotify ids and separates identically named artists', () => {
  const artists = rankListeningArtists([
    { artist: 'Tyler, The Creator, Guest', artist_id: 'creator-id', duration_ms: 1000 },
    { artist: 'Tyler, The Creator', artist_id: 'creator-id', duration_ms: 2000 },
    { artist: 'Shared', artist_id: 'one-id', duration_ms: 500 },
    { artist: 'Shared', artist_id: 'two-id', duration_ms: 400 },
  ], new Map([['creator-id', 'Tyler, The Creator']]));
  assert.deepEqual(artists.map(({ name, id, ms }) => ({ name, id, ms })), [
    { name: 'Tyler, The Creator', id: 'creator-id', ms: 3000 },
    { name: 'Shared', id: 'one-id', ms: 500 },
    { name: 'Shared', id: 'two-id', ms: 400 },
  ]);
});

test('a known Spotify artist can recover its photo from a Deezer identity confirmed by albums', async () => {
  const id = 'photoConfirmedTest0001';
  assert.equal(id.length, 22);
  cache.set(`dz-artist-for:v2:${id}`, { id: 401, name: 'Confirmed Photo', exact: true, namesakes: 2, matchedAlbums: 2, photo: 'confirmed-photo.jpg', fans: 20 });
  respond = (url) => {
    assert.equal(url.pathname, `/v1/artists/${id}`);
    return new Response(null, { status: 503 });
  };
  assert.equal(await artistPhotoFor({ id, name: 'Confirmed Photo' }), 'confirmed-photo.jpg');
});

test('a Spotify artist with no photo uses album overlap to select its Deezer namesake', async () => {
  const id = 'photoAlbumMatchTest001';
  assert.equal(id.length, 22);
  cache.set(`artistalbums:v1:${id}`, { released: [{ title: 'Distinctive album' }], upcoming: [] });
  respond = (url) => {
    if (url.pathname === `/v1/artists/${id}`) return { id, name: 'Photo Namesake', images: [] };
    if (url.pathname === '/search/artist') return { data: [{ id: 501, name: 'Photo Namesake', nb_fan: 1000, picture_medium: 'wrong-photo.jpg' }, { id: 502, name: 'Photo Namesake', nb_fan: 10, picture_medium: 'right-photo.jpg' }] };
    if (url.pathname === '/artist/501/albums') return { data: [{ title: 'Unrelated album' }] };
    if (url.pathname === '/artist/502/albums') return { data: [{ title: 'Distinctive album' }] };
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  assert.equal(await artistPhotoFor({ id, name: 'Photo Namesake' }), 'right-photo.jpg');
});

test('an unresolved Spotify artist never borrows a same-named Deezer photo', async () => {
  const id = 'photoUnresolvedTest001';
  assert.equal(id.length, 22);
  respond = (url) => {
    if (url.pathname === `/v1/artists/${id}`) return new Response(null, { status: 503 });
    if (url.pathname === '/search/artist') return { data: [{ id: 601, name: 'Unverified Photo', nb_fan: 10, picture_medium: 'stranger.jpg' }] };
    throw new Error(`Unexpected request ${url.pathname}`);
  };
  assert.equal(await artistPhotoFor({ id, name: 'Unverified Photo' }), undefined);
});

test('release identity ignores stale popularity-selected Deezer mappings', async () => {
  const id = 'stale-release-mapping';
  cache.set(`dz-artist-for:v1:${id}`, { id: 701, name: 'Stale Mapping', exact: true, namesakes: 2, photo: null, fans: 50 });
  respond = () => ({ data: [{ id: 701, name: 'Stale Mapping', nb_fan: 50 }, { id: 702, name: 'Stale Mapping', nb_fan: 5 }] });
  assert.equal(await deezerArtistIdForName('Stale Mapping', id), null);
});

test('a release album with a known Spotify artist id rejects a same-name artist', async () => {
  respond = () => ({ albums: { items: [
    { id: 'wrong-namesake-album', name: 'The New Album', artists: [{ id: 'other-id', name: 'Release Namesake' }] },
    { id: 'right-namesake-album', name: 'The New Album', artists: [{ id: 'wanted-id', name: 'Release Namesake' }] },
  ] } });
  assert.equal(await resolveSpotifyAlbumId('The New Album', 'Release Namesake', 'wanted-id'), 'right-namesake-album');
  assert.equal(await resolveSpotifyAlbumId('The New Album', 'Release Namesake'), null);
});

test('release album resolution refuses a different title with a common prefix', async () => {
  respond = () => ({ albums: { items: [{ id: 'wrong-title-album', name: 'Homecoming', artists: [{ id: 'artist-id', name: 'Title Artist' }] }] } });
  assert.equal(await resolveSpotifyAlbumId('Home', 'Title Artist'), null);
});

test('an incomplete Deezer search does not prove that an artist name is unique', async () => {
  respond = () => ({ data: [{ id: 801, name: 'Incomplete Search', picture_medium: 'unverified.jpg' }], next: 'https://api.deezer.com/search/artist?index=25' });
  assert.equal(await deezerArtistIdForName('Incomplete Search'), null);
});

test('release deduplication retains Unicode titles and ignores edition suffixes', () => {
  assert.equal(releaseNameKey('IGOR'), 'igor');
  assert.equal(releaseNameKey('IGOR (Deluxe Edition)'), 'igor');
  assert.equal(releaseNameKey('Привет, мир!'), 'приветмир');
  assert.notEqual(releaseNameKey('Flower Boy'), releaseNameKey('IGOR'));
});

test('a Spotify id without album evidence cannot be assigned a Deezer artist from a supplied name', async () => {
  respond = () => ({ data: [{ id: 901, name: 'Unverified Identity', nb_fan: 5, picture_medium: 'unverified.jpg' }] });
  assert.equal(await deezerArtistFor('unverified-spotify-id', 'Unverified Identity', []), null);
});
