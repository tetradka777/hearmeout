import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarMonths } from './calendarLayout';
const day = (date: string) => ({ date, minutes: 65, tracks: 2, topArtist: null, future: false });
test('calendar aligns November from Monday and Sunday without changing dates', () => {
  const days = Array.from({ length: 30 }, (_, i) => day(`2026-11-${String(i + 1).padStart(2, '0')}`));
  const [mon] = calendarMonths(days, 'mon');
  const [sun] = calendarMonths(days, 'sun');
  assert.equal(mon.cells.findIndex(Boolean), 6);
  assert.equal(sun.cells.findIndex(Boolean), 0);
  assert.equal(mon.cells.length % 7, 0);
  assert.deepEqual(mon.cells.filter(Boolean), days);
});
test('calendar splits season months and preserves missing dates as empty cells', () => {
  const days = [day('2026-06-30'), day('2026-07-02')];
  const months = calendarMonths(days, 'mon');
  assert.equal(months.length, 2);
  assert.equal(months[0].key, '2026-06');
  assert.equal(months[1].cells[2], null); // Wednesday July 1 has no supplied data
  assert.equal(months[1].cells[3]?.date, '2026-07-02');
  assert.deepEqual(months.flatMap(m => m.cells.filter(Boolean)), days);
});
