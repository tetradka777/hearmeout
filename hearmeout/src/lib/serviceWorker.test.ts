import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const ORIGIN = 'https://hearmeout.test';
const asset = (name: string) => `${ORIGIN}/_next/static/chunks/${name}.js`;
const publicAsset = (body = 'export default 1;', headers: Record<string, string> = {}) => new Response(body, {
  headers: { 'Cache-Control': 'public, max-age=31536000, immutable', 'Content-Type': 'text/javascript', ...headers },
});

function worker(network: (request: Request) => Promise<Response> = async () => publicAsset()) {
  const handlers = new Map<string, (event: unknown) => void>();
  const stores = new Map<string, Map<string, Response>>();
  const calls: string[] = [];
  const key = (request: Request | string) => typeof request === 'string' ? new URL(request, ORIGIN).href : request.url;
  const cache = (name: string) => {
    const entries = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, entries);
    return {
      match: async (request: Request | string) => entries.get(key(request))?.clone(),
      put: async (request: Request | string, response: Response) => { entries.set(key(request), response.clone()); },
      delete: async (request: Request | string) => entries.delete(key(request)),
      keys: async () => [...entries.keys()].map((url) => new Request(url)),
      add: async (request: string) => { entries.set(key(request), new Response('offline')); },
    };
  };
  const notifications: unknown[] = [];
  const opened: string[] = [];
  runInNewContext(readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8'), {
    URL, Request, Response,
    self: {
      location: { origin: ORIGIN },
      addEventListener: (name: string, listener: (event: unknown) => void) => handlers.set(name, listener),
      skipWaiting: async () => {},
      clients: { claim: async () => {}, matchAll: async () => [], openWindow: async (url: string) => { opened.push(url); } },
      registration: { showNotification: async (...args: unknown[]) => { notifications.push(args); } },
    },
    caches: {
      open: async (name: string) => cache(name),
      keys: async () => [...stores.keys()],
      delete: async (name: string) => stores.delete(name),
      match: async (request: Request | string) => {
        for (const entries of stores.values()) {
          const response = entries.get(key(request));
          if (response) return response.clone();
        }
        return undefined;
      },
    },
    fetch: async (request: Request | string) => {
      const req = typeof request === 'string' ? new Request(new URL(request, ORIGIN)) : request;
      calls.push(req.url);
      return network(req);
    },
  });
  const dispatch = async (name: string, detail: Record<string, unknown> = {}) => {
    let response: Promise<Response | undefined> | undefined;
    const work: Promise<unknown>[] = [];
    handlers.get(name)?.({
      ...detail,
      respondWith: (result: Promise<Response | undefined>) => { response = Promise.resolve(result); },
      waitUntil: (result: Promise<unknown>) => { work.push(Promise.resolve(result)); },
    });
    const result = await response;
    for (let i = 0; i < work.length; i++) await work[i];
    return result;
  };
  const staticEntries = () => [...stores.entries()].filter(([name]) => name.startsWith('hmo-static-')).flatMap(([, entries]) => [...entries]);
  return { dispatch, calls, stores, cache, staticEntries, notifications, opened };
}

test('immutable Next assets survive another load and a network outage', async () => {
  let online = true;
  const w = worker(async () => { if (!online) throw new Error('offline'); return publicAsset(); });
  const request = new Request(asset('build-a'));
  assert.equal(await (await w.dispatch('fetch', { request }))?.text(), 'export default 1;');
  online = false;
  assert.equal(await (await w.dispatch('fetch', { request }))?.text(), 'export default 1;');
  assert.equal(w.calls.length, 1);
});

test('API, HTML, remote assets, source maps, and writes stay outside the static cache', async () => {
  const w = worker();
  for (const request of [
    new Request(`${ORIGIN}/api/me`), new Request(`${ORIGIN}/?screen=profile`),
    new Request('https://cdn.test/_next/static/chunks/build.js'), new Request(`${asset('build')}.map`),
    new Request(asset('write'), { method: 'POST' }), new Request(asset('range'), { headers: { Range: 'bytes=0-10' } }),
  ]) assert.equal(await w.dispatch('fetch', { request }), undefined);
  assert.equal(w.calls.length, 0);
  assert.equal(w.staticEntries().length, 0);
});

test('failed, private, mutable, HTML, and oversized asset answers are never saved', async () => {
  const answers = [
    new Response('missing', { status: 404 }),
    publicAsset('private', { 'Cache-Control': 'private, immutable' }),
    publicAsset('no-store', { 'Cache-Control': 'no-store, immutable' }),
    publicAsset('mutable', { 'Cache-Control': 'public, max-age=0' }),
    publicAsset('<html>login</html>', { 'Content-Type': 'text/html' }),
    publicAsset('x'.repeat(1024 * 1024 + 1)),
  ];
  const w = worker(async () => answers.shift()!);
  for (let i = 0; i < 6; i++) await w.dispatch('fetch', { request: new Request(asset(`bad-${i}`)) });
  assert.equal(w.staticEntries().length, 0);
});

test('simultaneous asset writes respect both the count and the byte budget', async () => {
  const small = worker();
  await Promise.all(Array.from({ length: 55 }, (_, i) => small.dispatch('fetch', { request: new Request(asset(`small-${i}`)) })));
  assert.equal(small.staticEntries().length, 48);
  assert.ok(!small.staticEntries().some(([url]) => url === asset('small-0')));
  const large = worker(async () => publicAsset('x'.repeat(700_000)));
  await Promise.all(Array.from({ length: 15 }, (_, i) => large.dispatch('fetch', { request: new Request(asset(`large-${i}`)) })));
  const bytes = await Promise.all(large.staticEntries().map(async ([, response]) => (await response.arrayBuffer()).byteLength));
  assert.ok(bytes.reduce((sum, n) => sum + n, 0) <= 8 * 1024 * 1024);
  assert.ok(bytes.length > 0);
});

test('idle warmup accepts only local assets from a same-origin window and deduplicates them', async () => {
  const w = worker();
  const source = { type: 'window', url: `${ORIGIN}/` };
  const urls = [asset('boot'), asset('boot'), `${ORIGIN}/api/me`, 'https://cdn.test/_next/static/chunks/remote.js'];
  await w.dispatch('message', { source, data: { type: 'WARM_STATIC', urls } });
  await w.dispatch('message', { source, data: { type: 'WARM_STATIC', urls } });
  assert.deepEqual(w.calls, [asset('boot')]);
  await w.dispatch('message', { source: { type: 'window', url: 'https://other.test/' }, data: { type: 'WARM_STATIC', urls: [asset('other')] } });
  assert.equal(w.calls.length, 1);
});

test('navigation remains network-first with only the public offline fallback cached', async () => {
  let online = true;
  const w = worker(async () => { if (!online) throw new Error('offline'); return new Response('private page'); });
  await w.dispatch('install');
  const request = { url: `${ORIGIN}/?screen=profile`, method: 'GET', mode: 'navigate' };
  assert.equal(await (await w.dispatch('fetch', { request }))?.text(), 'private page');
  online = false;
  assert.equal(await (await w.dispatch('fetch', { request }))?.text(), 'offline');
  assert.equal(w.staticEntries().length, 0);
});

test('push notifications still display and open their target page', async () => {
  const w = worker();
  await w.dispatch('push', { data: { json: () => ({ title: 'friend request', body: 'hello', url: '/?screen=match' }) } });
  assert.equal(w.notifications.length, 1);
  let closed = false;
  await w.dispatch('notificationclick', { notification: { close: () => { closed = true; }, data: { url: '/?screen=match' } } });
  assert.equal(closed, true);
  assert.deepEqual(w.opened, ['/?screen=match']);
});
