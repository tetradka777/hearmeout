import test from 'node:test';
import assert from 'node:assert/strict';
import { discoveryMarkets, mixedChartPage } from './chartDiscovery';
import type { ChartAlbumLite } from './appleCharts';
const load = async (country: string): Promise<ChartAlbumLite[]> => Array.from({length:100},(_,i)=>({rank:i+1,title:country+' '+i,artist:'artist '+country,cover:null,genreBucket:country==='jp'?'Rock':country==='br'?'Latin':'Hip-Hop',country}));
test('the first discovery page mixes distant markets instead of exhausting the local top 100',async()=>{
 const markets=discoveryMarkets('US');assert.deepEqual(markets.slice(0,3),['us','jp','br']);
 let active=0,max=0;const page=await mixedChartPage(0,markets,async c=>{active++;max=Math.max(max,active);await Promise.resolve();active--;return load(c);});
 assert.equal(page.albums.length,18);assert.deepEqual(page.albums.slice(0,3).map(a=>a.country),['us','jp','br']);assert.equal(new Set(page.albums.map(a=>a.genreBucket)).size,3);assert.ok(max<=3);assert.equal(page.next,1);
});
test('mixed pages advance through new countries and offsets without repeating slices',async()=>{
 const markets=discoveryMarkets('us');const groups=Math.ceil(markets.length/3);
 const first=await mixedChartPage(0,markets,load),next=await mixedChartPage(1,markets,load),round=await mixedChartPage(groups,markets,load);
 assert.ok(next.albums.every(a=>!['us','jp','br'].includes(a.country)));assert.equal(round.albums[0].rank,7);assert.ok(!round.albums.some(a=>first.albums.some(b=>a.title===b.title)));
 assert.deepEqual(await mixedChartPage(10000,markets,load),{albums:[],next:null});
});
test('unavailable markets stay empty while transient failures can be retried',async()=>{
 const markets=discoveryMarkets('ru');const page=await mixedChartPage(0,markets,async c=>c==='ru'?[]:load(c));assert.ok(page.albums.length);assert.ok(page.albums.every(a=>a.country!=='ru'));
 await assert.rejects(mixedChartPage(0,markets,async()=>{throw Error('temporary');}));
 const partial=await mixedChartPage(0,markets,async c=>{if(c==='ru')throw Error('temporary');return load(c);});assert.equal(partial.albums.length,12);assert.equal(partial.next,1);
});
