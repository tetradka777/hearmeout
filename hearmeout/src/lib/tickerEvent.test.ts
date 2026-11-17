import test from 'node:test';
import assert from 'node:assert/strict';
import { newsTickerEvent } from './tickerEvent';
import { translate } from './i18n';
import { highlightTickerText } from './tickerHighlights';
const t = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars);
const marked = (event: NonNullable<ReturnType<typeof newsTickerEvent>>) => highlightTickerText(event.text,event.highlights ?? []).filter(x=>x.highlight).map(x=>x.text);
test('news highlight rendered release title and concert/upcoming dates and venue',()=>{
  const base={id:'news',artist:'Tyler, The Creator',date:'2026-12-12',mine:true};
  const release=newsTickerEvent({...base,kind:'release',title:'CHROMAKOPIA'},'en',t,()=>null)!;
  assert.equal(release.name,base.artist);assert.deepEqual(marked(release),['CHROMAKOPIA']);
  const upcoming=newsTickerEvent({...base,kind:'upcoming',title:'New record'},'en',t,()=>null)!;
  assert.equal(marked(upcoming).length,2);assert.ok(marked(upcoming).includes('New record'));
  const concert=newsTickerEvent({...base,kind:'concert',city:'London',country:'GB'},'en',t,()=>null)!;
  assert.equal(marked(concert).length,2);assert.ok(marked(concert).some(x=>x.includes('London')));
});
test('records, milestones and weekly albums retain meaningful values as highlighted plain text',()=>{
  const day=newsTickerEvent({kind:'dayRecord',id:'d',minutes:120},'en',t,()=>null)!;assert.deepEqual(marked(day),['120']);
  const milestone=newsTickerEvent({kind:'milestone',id:'m',name:'matthew',userId:'u',count:100},'en',t,()=>null)!;assert.equal(milestone.name,'matthew');assert.deepEqual(marked(milestone),['100']);
  const week=newsTickerEvent({kind:'albumOfWeek',id:'w',albumId:'a',count:8},'en',t,()=>'<real album>')!;assert.deepEqual(marked(week),['<real album>','8']);
  assert.equal(newsTickerEvent({kind:'albumOfWeek',id:'w',albumId:'missing',count:8},'en',t,()=>null),null);
});
