import { test } from 'node:test';
import assert from 'node:assert/strict';
import { albumSearchTitle, selectAlbumMatch } from './albumResolution';
const album = (name: string, artist = 'Tyler, The Creator', artistId = 'real') => ({ id: name, name, artists: [{name: artist, id: artistId}] });
test('external chart EP and Single suffixes do not prevent opening the same release', () => {
  assert.equal(albumSearchTitle('BREAK EVEN - EP'), 'BREAK EVEN');
  assert.equal(selectAlbumMatch([album('BREAK EVEN')], 'BREAK EVEN - EP', 'Tyler, The Creator'), 'BREAK EVEN');
  assert.equal(selectAlbumMatch([album('Song')], 'Song - Single', 'Tyler, The Creator'), 'Song');
});
test('matching keeps exact artist identity and rejects namesakes and unrelated titles', () => {
  assert.equal(selectAlbumMatch([album('Flower Boy', 'Tyler')], 'Flower Boy', 'Tyler, The Creator'), null);
  assert.equal(selectAlbumMatch([album('Flower Boy'),album('Flower Boy','Tyler, The Creator','other')], 'Flower Boy','Tyler, The Creator'), null);
  assert.equal(selectAlbumMatch([album('Flower Boy','Tyler, The Creator','real')], 'Flower Boy','wrong display name','real'), 'Flower Boy');
  assert.equal(selectAlbumMatch([album('Song Two')], 'Song - Single','Tyler, The Creator'), null);
  assert.equal(selectAlbumMatch([album('Live Forever')], 'Forever','Tyler, The Creator'), null);
});
