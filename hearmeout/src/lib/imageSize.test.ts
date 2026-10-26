import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sizedImage } from './imageSize';

const album = (prefix: string) => `https://i.scdn.co/image/${prefix}c8b444df094279e70d0ed856`;

test('Spotify album covers: smallest sharp variant', () => {
  assert.equal(sizedImage(album('ab67616d0000b273'), 44), album('ab67616d00001e02')); // 88 px → 300
  assert.equal(sizedImage(album('ab67616d0000b273'), 30), album('ab67616d00004851')); // 60 px → 64
  assert.equal(sizedImage(album('ab67616d0000b273'), 400), album('ab67616d0000b273')); // big stays 640
  assert.equal(sizedImage(album('ab67616d00001e02'), 400), album('ab67616d0000b273')); // and goes up if needed
});

test('Spotify artist photos and Deezer covers', () => {
  const artist = (p: string) => `https://i.scdn.co/image/${p}959527d2fabc9c64287e57b9`;
  assert.equal(sizedImage(artist('ab6761610000e5eb'), 60), artist('ab6761610000f178'));
  assert.equal(sizedImage('https://cdn-images.dzcdn.net/images/cover/1dd56fd8/1000x1000-000000-80-0-0.jpg', 44), 'https://cdn-images.dzcdn.net/images/cover/1dd56fd8/120x120-000000-80-0-0.jpg');
});

test('other URLs unchanged', () => {
  assert.equal(sizedImage('data:image/jpeg;base64,AAAA', 44), 'data:image/jpeg;base64,AAAA');
  assert.equal(sizedImage('https://coverartarchive.org/release-group/x/front-250', 44), 'https://coverartarchive.org/release-group/x/front-250');
  assert.equal(sizedImage(null, 44), undefined);
});

test('Apple Music chart covers', () => {
  const apple = (s: string) => `https://is1-ssl.mzstatic.com/image/thumb/Music211/v4/ea/98/f2/ea98f2b8/093624812647.jpg/${s}.jpg`;
  assert.equal(sizedImage(apple('400x400bb'), 24), apple('64x64bb')); // a colour sample
  assert.equal(sizedImage(apple('400x400bb'), 120), apple('300x300bb'));
  assert.equal(sizedImage(apple('100x100bb'), 500), apple('600x600bb')); // at most 600
});
