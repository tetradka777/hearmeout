import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { nextTickerPosition, syncTickerPosition, tickerHoldMs } from './tickerRotation';

const mira = { id: 'mira', name: 'mira', text: 'played Movie for the first time' };
const daniil = { id: 'daniil', name: 'daniil', text: 'rated Album 4.5' };

test('new ticker data preserves the event being read and its remaining reading time', () => {
  assert.deepEqual(syncTickerPosition({ id: 'daniil', elapsedMs: 2100 }, [mira, daniil]), { id: 'daniil', elapsedMs: 2100 });
  assert.deepEqual(syncTickerPosition({ id: 'daniil', elapsedMs: 2100 }, [
    { id: 'news', name: 'artist', text: 'new release: Album' }, mira, daniil,
  ]), { id: 'daniil', elapsedMs: 2100 });
});

test('removing the current ticker event starts the next available phrase from its beginning', () => {
  assert.deepEqual(syncTickerPosition({ id: 'old', elapsedMs: 5900 }, [mira, daniil]), { id: 'mira', elapsedMs: 0 });
  assert.deepEqual(syncTickerPosition({ id: 'mira', elapsedMs: 5900 }, []), { id: null, elapsedMs: 0 });
});

test('ticker advances whole events in order and wraps to the first event', () => {
  assert.deepEqual(nextTickerPosition({ id: 'mira', elapsedMs: 6000 }, [mira, daniil]), { id: 'daniil', elapsedMs: 0 });
  assert.deepEqual(nextTickerPosition({ id: 'daniil', elapsedMs: 6000 }, [mira, daniil]), { id: 'mira', elapsedMs: 0 });
  assert.deepEqual(nextTickerPosition({ id: null, elapsedMs: 0 }, []), { id: null, elapsedMs: 0 });
});

test('long names and messages receive more reading time without shortening their content', () => {
  const long = { id: 'long', name: 'a listener with a long display name', text: 'played a song with a very long title for the first time and rated the full album after listening' };
  assert.ok(tickerHoldMs(mira) >= 6000);
  assert.ok(tickerHoldMs(long) > tickerHoldMs(mira));
  assert.ok(tickerHoldMs({ ...mira, name: 'a'.repeat(100), text: 'b'.repeat(200) }) > tickerHoldMs(mira));
});
