import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCoverImageCache } from './coverImages';

function pendingImage() {
  let finish!: (loaded: boolean) => void;
  const result = new Promise<boolean>((resolve) => { finish = resolve; });
  return { result, finish };
}

const settled = () => new Promise<void>((resolve) => queueMicrotask(resolve));

test('copies of one cover share a pending image probe', async () => {
  const image = pendingImage();
  const requested: string[] = [];
  const cache = createCoverImageCache((url) => { requested.push(url); return image.result; });
  const completed: string[] = [];
  cache.watch('cover.jpg', () => completed.push('home'));
  cache.watch('cover.jpg', () => completed.push('profile'));
  assert.equal(cache.read('cover.jpg'), 'loading');
  assert.deepEqual(requested, ['cover.jpg']);
  assert.deepEqual(completed, []);
  image.finish(true);
  await settled();
  assert.equal(cache.read('cover.jpg'), 'loaded');
  assert.deepEqual(completed, ['home', 'profile']);
});

test('a cover shown again reuses its successful result without probing', async () => {
  let probes = 0;
  const cache = createCoverImageCache(async () => { probes++; return true; });
  cache.watch('cover.jpg', () => {});
  await settled();
  cache.watch('cover.jpg', () => {});
  cache.watch('cover.jpg', () => {});
  assert.equal(cache.read('cover.jpg'), 'loaded');
  assert.equal(probes, 1);
});

test('failed covers are shared and retried once after a pause', async () => {
  let now = 100;
  let probes = 0;
  const retry = pendingImage();
  const cache = createCoverImageCache(() => {
    probes++;
    return probes === 1 ? Promise.resolve(false) : retry.result;
  }, { now: () => now, failureRetryMs: 60_000 });
  cache.watch('missing.jpg', () => {});
  await settled();
  assert.equal(cache.read('missing.jpg'), 'failed');
  now = 60_099;
  cache.watch('missing.jpg', () => {});
  assert.equal(probes, 1);
  now = 60_100;
  cache.watch('missing.jpg', () => {});
  cache.watch('missing.jpg', () => {});
  assert.equal(probes, 2);
  assert.equal(cache.read('missing.jpg'), 'loading');
  retry.finish(true);
  await settled();
  assert.equal(cache.read('missing.jpg'), 'loaded');
});

test('switching cover URLs disconnects the old result from the current cover', async () => {
  const oldImage = pendingImage();
  const newImage = pendingImage();
  const cache = createCoverImageCache((url) => url === 'old.jpg' ? oldImage.result : newImage.result);
  const completed: string[] = [];
  const stopOld = cache.watch('old.jpg', () => completed.push('old'));
  stopOld();
  cache.watch('new.jpg', () => completed.push('new'));
  oldImage.finish(false);
  await settled();
  assert.equal(cache.read('old.jpg'), 'failed');
  assert.equal(cache.read('new.jpg'), 'loading');
  assert.deepEqual(completed, []);
  newImage.finish(true);
  await settled();
  assert.deepEqual(completed, ['new']);
  assert.equal(cache.read('new.jpg'), 'loaded');
});

test('unmounting one copy keeps the shared probe available for the next copy', async () => {
  const image = pendingImage();
  let probes = 0;
  const cache = createCoverImageCache(() => { probes++; return image.result; });
  const completed: string[] = [];
  const stop = cache.watch('cover.jpg', () => completed.push('removed'));
  stop();
  cache.watch('cover.jpg', () => completed.push('current'));
  image.finish(true);
  await settled();
  assert.equal(probes, 1);
  assert.deepEqual(completed, ['current']);
});

test('bounded cache evicts old settled covers and keeps pending probes shared', async () => {
  const pending = pendingImage();
  const requested: string[] = [];
  const cache = createCoverImageCache((url) => {
    requested.push(url);
    return url === 'pending.jpg' ? pending.result : Promise.resolve(true);
  }, { maxEntries: 2 });
  cache.watch('pending.jpg', () => {});
  for (const url of ['old.jpg', 'new.jpg', 'latest.jpg']) {
    cache.watch(url, () => {});
    await settled();
  }
  cache.watch('pending.jpg', () => {});
  cache.watch('latest.jpg', () => {});
  assert.deepEqual(requested, ['pending.jpg', 'old.jpg', 'new.jpg', 'latest.jpg']);
  assert.equal(cache.read('old.jpg'), undefined);
  assert.equal(cache.read('pending.jpg'), 'loading');
  cache.watch('old.jpg', () => {});
  await settled();
  assert.equal(requested.length, 5);
  pending.finish(true);
  await settled();
});

test('a rejected image probe is remembered as a failure', async () => {
  let probes = 0;
  const cache = createCoverImageCache(() => { probes++; return Promise.reject(new Error('network')); });
  cache.watch('offline.jpg', () => {});
  await settled();
  cache.watch('offline.jpg', () => {});
  assert.equal(cache.read('offline.jpg'), 'failed');
  assert.equal(probes, 1);
});

test('finishing a probe keeps its result reusable while other covers are pending', async () => {
  const first = pendingImage();
  const second = pendingImage();
  const requested: string[] = [];
  const cache = createCoverImageCache((url) => {
    requested.push(url);
    return url === 'first.jpg' ? first.result : second.result;
  }, { maxEntries: 1 });
  cache.watch('first.jpg', () => {});
  cache.watch('second.jpg', () => {});
  first.finish(true);
  await settled();
  assert.equal(cache.read('first.jpg'), 'loaded');
  cache.watch('first.jpg', () => {});
  assert.deepEqual(requested, ['first.jpg', 'second.jpg']);
  second.finish(true);
  await settled();
});

test('a recovered cover updates existing copies as well as the copy that retried', async () => {
  let now = 0;
  let probes = 0;
  const cache = createCoverImageCache(async () => ++probes > 1, { now: () => now, failureRetryMs: 60_000 });
  const results: string[] = [];
  const stopFirst = cache.watch('cover.jpg', () => results.push(`first:${cache.read('cover.jpg')}`));
  await settled();
  now = 60_000;
  const stopSecond = cache.watch('cover.jpg', () => results.push(`second:${cache.read('cover.jpg')}`));
  await settled();
  assert.deepEqual(results, ['first:failed', 'first:loaded', 'second:loaded']);
  stopFirst();
  stopSecond();
});

test('a mounted failed cover recovers on a shared retry after the cooldown', async () => {
  let now = 0, probes = 0;
  const pending = pendingImage();
  const cache = createCoverImageCache(() => ++probes === 1 ? Promise.resolve(false) : pending.result, { now: () => now, failureRetryMs: 60_000 });
  const results: string[] = [];
  cache.watch('return.jpg', () => results.push(cache.read('return.jpg')!));
  await settled();
  cache.retry('return.jpg');
  assert.equal(probes, 1);
  now = 60_000;
  cache.retry('return.jpg'); cache.retry('return.jpg');
  assert.equal(probes, 2);
  pending.finish(true); await settled();
  assert.equal(cache.read('return.jpg'), 'loaded');
  assert.equal(results.at(-1), 'loaded');
});

test('coming back online retries a failed URL once and preserves loaded URLs', async () => {
  let probes = 0;
  const pending = pendingImage();
  const cache = createCoverImageCache(() => ++probes === 1 ? Promise.resolve(false) : pending.result);
  cache.watch('online.jpg', () => {}); await settled();
  cache.retry('online.jpg', true); cache.retry('online.jpg', true);
  assert.equal(probes, 2);
  pending.finish(true); await settled();
  cache.retry('online.jpg', true);
  assert.equal(probes, 2);
});