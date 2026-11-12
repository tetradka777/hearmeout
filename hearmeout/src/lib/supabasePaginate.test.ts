import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchAllRows } from './supabasePaginate';

function source(count: number) {
  const calls: [number, number][] = [];
  const query = async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: Array.from({ length: Math.max(0, Math.min(to + 1, count) - from) }, (_, i) => from + i), error: null };
  };
  return { calls, query };
}

for (const count of [0, 1, 999]) {
  test(`a ${count}-row result needs only one query with concurrency six`, async () => {
    const { calls, query } = source(count);
    const result = await fetchAllRows(query, 50000, 6);
    assert.equal(result.error, null);
    assert.equal(result.rows.length, count);
    assert.deepEqual(calls, [[0, 999]]);
  });
}

for (const count of [1000, 1001, 6000, 6501]) {
  test(`all ${count} rows retain stable order across page boundaries`, async () => {
    const { calls, query } = source(count);
    const result = await fetchAllRows(query, 50000, 3);
    assert.equal(result.error, null);
    assert.deepEqual(result.rows, Array.from({ length: count }, (_, i) => i));
    assert.equal(new Set(calls.map(([from]) => from)).size, calls.length);
    assert.deepEqual(calls[0], [0, 999]);
  });
}

test('only after the first full page, subsequent pages run in bounded parallel waves', async () => {
  const releases = new Map<number, () => void>();
  const calls: number[] = [];
  let active = 0;
  let peak = 0;
  const pending = fetchAllRows(async (from, to) => {
    calls.push(from);
    peak = Math.max(peak, ++active);
    await new Promise<void>((resolve) => releases.set(from, resolve));
    active--;
    return { data: Array.from({ length: to - from + 1 }, (_, i) => from + i), error: null };
  }, 7000, 3);
  assert.deepEqual(calls, [0]);
  releases.get(0)!();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [0, 1000, 2000, 3000]);
  // Complete the wave out of order; the returned rows must remain ordered.
  for (const from of [3000, 1000, 2000]) releases.get(from)!();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [0, 1000, 2000, 3000, 4000, 5000, 6000]);
  for (const from of [6000, 5000, 4000]) releases.get(from)!();
  const result = await pending;
  assert.equal(peak, 3);
  assert.deepEqual(result.rows, Array.from({ length: 7000 }, (_, i) => i));
});

test('a first-page error stops without speculative queries', async () => {
  let calls = 0;
  const result = await fetchAllRows(async () => {
    calls++;
    return { data: null, error: { message: 'offline' } };
  }, 50000, 6);
  assert.deepEqual(result, { rows: [], error: 'offline' });
  assert.equal(calls, 1);
});

test('an error in a later wave returns only preceding rows', async () => {
  const { query } = source(5000);
  const result = await fetchAllRows((from, to) => from === 2000
    ? Promise.resolve({ data: null, error: { message: 'page failed' } })
    : query(from, to), 50000, 3);
  assert.equal(result.error, 'page failed');
  assert.deepEqual(result.rows, Array.from({ length: 2000 }, (_, i) => i));
});

test('a null first page is an empty result', async () => {
  let calls = 0;
  const result = await fetchAllRows(async () => { calls++; return { data: null, error: null }; }, 50000, 6);
  assert.deepEqual(result, { rows: [], error: null });
  assert.equal(calls, 1);
});

for (const maxRows of [0, 1000, 2000, 7000]) {
  test(`maxRows ${maxRows} bounds requests and output`, async () => {
    const { calls, query } = source(10000);
    const result = await fetchAllRows(query, maxRows, 6);
    assert.equal(result.error, null);
    assert.equal(result.rows.length, maxRows);
    assert.ok(calls.every(([, to]) => to < maxRows));
  });
}

test('default serial pagination still stops at the first short page', async () => {
  const { calls, query } = source(1001);
  const result = await fetchAllRows(query);
  assert.equal(result.rows.length, 1001);
  assert.deepEqual(calls, [[0, 999], [1000, 1999]]);
});
