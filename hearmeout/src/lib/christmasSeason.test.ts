import {test} from 'node:test';
import assert from 'node:assert/strict';
import {christmasSeasonActive, nextLocalMidnight, subscribeChristmasSeason} from './christmasSeason';

test('Christmas shelf runs Nov15 through Jan7 inclusive every year',()=>{
 for(const year of [2026,2027,2028]){
  for(const [month,day,hour,on] of [[10,14,23,false],[10,15,0,true],[11,31,23,true],[0,1,0,true],[0,7,23,true],[0,8,0,false],[5,25,12,false]] as const){assert.equal(christmasSeasonActive(new Date(year,month,day,hour,59,59)),on,`${year}/${month+1}/${day}`);}
 }
 assert.equal(christmasSeasonActive(new Date(NaN)),false);
});
test('season uses visitor calendar, not UTC dates',()=>{
 const original=process.env.TZ;
 try {
  process.env.TZ='Pacific/Kiritimati';
  assert.equal(christmasSeasonActive(new Date('2026-11-14T23:30:00Z')),true);
  assert.equal(christmasSeasonActive(new Date('2027-01-08T00:30:00Z')),false);
  process.env.TZ='America/Los_Angeles';
  assert.equal(christmasSeasonActive(new Date('2026-11-14T23:30:00Z')),false);
  assert.equal(christmasSeasonActive(new Date('2027-01-08T00:30:00Z')),true);
 } finally { if(original===undefined)delete process.env.TZ;else process.env.TZ=original; }
});
test('season clock rechecks at next local midnight including year and DST changes',()=>{
 for(const date of [new Date(2026,10,14,23,59,59),new Date(2026,11,31,23,59,59),new Date(2026,2,28,12)]){
  const next=nextLocalMidnight(date);assert.equal(next.getHours(),0);assert.equal(next.getMinutes(),0);assert.ok(next.getTime()>date.getTime());assert.ok(next.getTime()-date.getTime()<=25*3600000);
 }
});

test('mounted seasonal clock switches at midnight and catches up on tab return', t=>{
 const win=new EventTarget(),doc=new EventTarget();const originalWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),originalDocument=Object.getOwnPropertyDescriptor(globalThis,'document');
 Object.defineProperty(globalThis,'window',{configurable:true,value:win});Object.defineProperty(globalThis,'document',{configurable:true,value:doc});
 t.after(()=>{for(const [key,descriptor]of [['window',originalWindow],['document',originalDocument]] as const){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);}});
 t.mock.timers.enable({apis:['Date','setTimeout'],now:new Date(2026,10,14,23,59,59).getTime()});
 const values:boolean[]=[];const unsubscribe=subscribeChristmasSeason(()=>values.push(christmasSeasonActive()));
 assert.deepEqual(values,[false]);t.mock.timers.tick(1000);assert.deepEqual(values,[false,true]);
 t.mock.timers.setTime(new Date(2027,0,8,10).getTime());doc.dispatchEvent(new Event('visibilitychange'));assert.equal(values.at(-1),false);
 unsubscribe();const count=values.length;win.dispatchEvent(new Event('pageshow'));t.mock.timers.tick(86400000);assert.equal(values.length,count);
});
