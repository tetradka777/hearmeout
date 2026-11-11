import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDiscoveryBlocks } from './homeDiscoveryLayout';
const albums=Array.from({length:37},(_,i)=>({genreBucket:i%3===0?'Rock':'Pop',country:i<16?'us':'gb'}));
test('discovery uses each item once and provides distinct rows, pairs and review layouts',()=>{
 const blocks=buildDiscoveryBlocks(albums,9);
 const music=blocks.filter(b=>b.kind==='albums').flatMap(b=>b.indices);const reviews=blocks.filter(b=>b.kind==='reviews').flatMap(b=>b.indices);
 assert.deepEqual([...music].sort((a,b)=>a-b),albums.map((_,i)=>i));assert.equal(new Set(music).size,music.length);
 assert.deepEqual([...reviews].sort((a,b)=>a-b),Array.from({length:9},(_,i)=>i));
 assert.ok(blocks.some(b=>b.kind==='albums'&&b.layout==='row'));assert.ok(blocks.some(b=>b.kind==='albums'&&b.layout==='pair'));
 assert.ok(blocks.some(b=>b.kind==='reviews'&&b.indices.length===1));assert.ok(blocks.some(b=>b.kind==='reviews'&&b.indices.length>1));
 for(const b of blocks){assert.ok(b.indices.length);if(b.kind==='albums'&&b.genre)assert.ok(b.indices.every(i=>albums[i].genreBucket===b.genre));if(b.kind==='albums'&&b.country)assert.ok(b.indices.every(i=>albums[i].country===b.country));}
});
test('completed discovery groups keep the same keys and contents when another page is appended',()=>{
 const before=buildDiscoveryBlocks(albums.slice(0,16),5),after=buildDiscoveryBlocks(albums,9);
 assert.deepEqual(after.slice(0,before.length),before);assert.deepEqual(buildDiscoveryBlocks([],0),[]);
});

test('dominant charts do not repeat country or genre headings throughout the feed',()=>{
 const repeated=Array.from({length:128},()=>({country:'us',genreBucket:'Hip-Hop'}));
 const blocks=buildDiscoveryBlocks(repeated,30);
 const topics=blocks.flatMap(b=>b.kind==='albums'?[b.genre&&'genre:'+b.genre,b.country&&'country:'+b.country].filter(Boolean):[]);
 assert.equal(new Set(topics).size,topics.length);
});