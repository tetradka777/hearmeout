import {test}from'node:test';import assert from'node:assert/strict';import{CHRISTMAS_TRACKS}from'./christmasTracks';
test('editorial Christmas tracks have distinct real track links and original Spotify artwork',()=>{
 assert.equal(CHRISTMAS_TRACKS.length,12);assert.equal(new Set(CHRISTMAS_TRACKS.map(t=>t.trackId)).size,12);assert.equal(new Set(CHRISTMAS_TRACKS.map(t=>t.artist)).size,12);
 for(const track of CHRISTMAS_TRACKS){assert.match(track.trackId,/^[a-zA-Z0-9]{22}$/);assert.equal(track.url,`https://open.spotify.com/track/${track.trackId}`);assert.ok(track.title&&track.artist);const cover=new URL(track.cover);assert.equal(cover.protocol,'https:');assert.ok(cover.hostname.endsWith('.spotifycdn.com')||cover.hostname==='i.scdn.co');assert.match(cover.pathname,/^\/image\/[a-z0-9]+$/);assert.ok(!('spotifyId'in track));}
});
