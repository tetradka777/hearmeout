import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveAlbum } from './resolveAlbum';
test('album resolution coalesces taps, caches success and distinguishes outages from absence', async () => {
 const original = globalThis.fetch;
 let calls = 0;
 globalThis.fetch = async () => { calls++; await new Promise(r => setTimeout(r, 5)); return Response.json({id:'a'.repeat(22)}); };
 try {
   const results = await Promise.all([resolveAlbum('success','artist'),resolveAlbum('success','artist')]);
   assert.deepEqual(results,[{id:'a'.repeat(22)},{id:'a'.repeat(22)}]);
   await resolveAlbum('success','artist'); assert.equal(calls,1);
   globalThis.fetch = async () => { calls++; return Response.json({error:'rate_limited'}, {status:503,headers:{'Retry-After':'60'}}); };
   assert.deepEqual(await resolveAlbum('limited','artist'),{error:'unavailable'});
   await resolveAlbum('limited','artist'); assert.equal(calls,2);
   globalThis.fetch = async () => Response.json({error:'not_found'}, {status:404});
   assert.deepEqual(await resolveAlbum('missing','artist'),{error:'not_found'});
   globalThis.fetch = async () => { throw new Error('offline'); };
   assert.deepEqual(await resolveAlbum('offline','artist'),{error:'unavailable'});
 } finally { globalThis.fetch = original; }
});
