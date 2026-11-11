import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chartAlbums } from './appleCharts';
import { ALBUMS } from './data';

// Real chart selection and durable/memory cache code, mocked HTTP boundary.
// Every unrecognized host fails closed, including Spotify and token calls.
const originalFetch = globalThis.fetch;
const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
type AppleAlbum = { name: string; artistName: string; artworkUrl100?: string; genres?: { genreId: string; name: string }[] };
const feeds = new Map<string, AppleAlbum[] | number>();
const cache = new Map<string, unknown>();
const appleCalls: string[] = [];
const unexpectedHosts: string[] = [];
const album = (name: string, artistName = 'Chart Fixture Artist'): AppleAlbum => ({
  name, artistName, artworkUrl100: 'https://artwork.example/100x100bb.jpg', genres: [{ genreId: '21', name: 'Rock' }],
});

before(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://apple-chart-test.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-key';
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === 'apple-chart-test.invalid') {
      assert.equal(url.pathname, '/rest/v1/spotify_cache');
      if (init?.method === 'POST') {
        const row = JSON.parse(String(init.body)) as { key: string; payload: unknown };
        cache.set(row.key, row.payload);
        return new Response(null, { status: 201 });
      }
      const filter = url.searchParams.get('key') || '';
      if (filter.startsWith('eq.')) {
        const key = filter.slice(3);
        return Response.json(cache.has(key) ? { payload: cache.get(key), expires_at: '2099-01-01T00:00:00Z' } : null);
      }
      assert.ok(filter.startsWith('in.'));
      return Response.json([...cache].filter(([key]) => filter.includes(key)).map(([key, payload]) => ({ key, payload, expires_at: '2099-01-01T00:00:00Z' })));
    }
    if (url.hostname === 'rss.applemarketingtools.com') {
      const country = url.pathname.split('/')[3];
      appleCalls.push(country);
      const feed = feeds.get(country);
      assert.notEqual(feed, undefined, `Unexpected chart market: ${country}`);
      return typeof feed === 'number' ? new Response(null, { status: feed }) : Response.json({ feed: { results: feed } });
    }
    unexpectedHosts.push(url.hostname);
    throw new Error('Unexpected upstream request');
  };
});

after(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  assert.deepEqual(unexpectedHosts, [], 'Chart browsing must never call Spotify or its token endpoint');
});

test('a cold chart returns Apple metadata without Spotify or token requests', async () => {
  feeds.set('ca', [
    { ...album('Sleep Music'), genres: [{ genreId: '14', name: 'Pop' }] },
    { ...album('Children Fixture'), genres: [{ genreId: '4', name: 'Children' }] },
    album('A New Chart Release'),
    ...Array.from({ length: 45 }, (_, i) => album(`Fresh Chart Album ${i}`)),
  ]);
  const result = await chartAlbums('CA');
  assert.equal(result.length, 40);
  assert.deepEqual(result[0], {
    rank: 3, title: 'A New Chart Release', artist: 'Chart Fixture Artist',
    cover: 'https://artwork.example/400x400bb.jpg', genreBucket: 'Rock', country: 'ca',
  });
  assert.ok(result.every((entry) => !entry.spotifyId));
  assert.deepEqual(unexpectedHosts, []);
});

test('known exact catalog, resolved and previous-chart ids retain score lookup keys', async () => {
  const catalog = ALBUMS.find((entry) => entry.id === 'ok-computer')!;
  feeds.set('gb', [album('OK COMPUTER', 'RADIOHEAD'), album('Resolved Fixture'), album('Previous Fixture')]);
  cache.set('resolve-album:v4:resolved fixture:chart fixture artist', 'resolved-fixture-id');
  cache.set('apple-chart:v5:gb', [{ title: 'previous fixture', artist: 'chart fixture artist', spotifyId: 'previous-fixture-id' }]);
  const result = await chartAlbums('gb');
  assert.deepEqual(result.map((entry) => entry.spotifyId), [catalog.spotifyId, 'resolved-fixture-id', 'previous-fixture-id']);
  // This is the same id-based lookup used by the card's community score.
  const ratings = new Map([[catalog.spotifyId, 4.3], ['resolved-fixture-id', 3.8], ['previous-fixture-id', 4.1]]);
  assert.deepEqual(result.map((entry) => ratings.get(entry.spotifyId)), [4.3, 3.8, 4.1]);
});

test('a different artist, edition or unresolved match never inherits another album id', async () => {
  feeds.set('de', [album('OK Computer', 'Radiohead Tribute'), album('OK Computer Deluxe', 'Radiohead'), album('Same Fixture Title', 'Actual Fixture Artist'), album('Unresolved Fixture')]);
  cache.set('resolve-album:v4:unresolved fixture:chart fixture artist', null);
  cache.set('apple-chart:v5:de', [
    { title: 'Same Fixture Title', artist: 'Other Fixture Artist', spotifyId: 'wrong-artist-id' },
    { title: 'Different Fixture Title', artist: 'Actual Fixture Artist', spotifyId: 'wrong-title-id' },
    { title: 'OK Computer', artist: 'Radiohead', spotifyId: 'wrong-edition-id' },
  ]);
  assert.ok((await chartAlbums('de')).every((entry) => !entry.spotifyId));
});

test('an unsupported chart market falls back to the real US feed', async () => {
  feeds.set('zz', 404);
  feeds.set('us', [album('US Chart Fixture')]);
  const start = appleCalls.length;
  const result = await chartAlbums('zz');
  assert.deepEqual(appleCalls.slice(start), ['zz', 'us']);
  assert.equal(result[0].title, 'US Chart Fixture');
  assert.equal((result[0] as { country?: string }).country, 'us');
});

test('reopening the same chart reuses its cached Apple feed', async () => {
  feeds.set('au', [album('Cached Chart Fixture')]);
  const first = await chartAlbums('au');
  const count = appleCalls.length;
  feeds.set('au', 503);
  assert.deepEqual(await chartAlbums('AU'), first);
  assert.equal(appleCalls.length, count);
});

test('a transient chart failure does not silently replace the chosen country', async () => {
  feeds.set('fr', 503);
  const start = appleCalls.length;
  await assert.rejects(chartAlbums('fr'), /Apple chart unavailable/);
  assert.deepEqual(appleCalls.slice(start), ['fr']);
});
