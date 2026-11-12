import { test } from 'node:test';
import assert from 'node:assert/strict';
import { musicEntryAlbum } from './musicEntryAlbum';

test('music entries resolve exact catalog IDs without upstream requests and reject unknown slugs', async(t)=>{
 t.mock.method(globalThis,'fetch',()=>{throw new Error('unexpected upstream call');});
 const slug=await musicEntryAlbum('abbey-road');
 const spotify=await musicEntryAlbum('0ETFjACtuP2ADo6LFhL6HN');
 assert.equal(slug?.title,'Abbey Road');assert.deepEqual(slug,spotify);
 for(const id of ['missing-album','../api','https://bad.example/album',''])assert.equal(await musicEntryAlbum(id),null);
});
