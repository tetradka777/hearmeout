import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { loadedStaticAssetUrls } from './staticAssetWarmup';

const origin = 'https://hearmeout.test';

test('warmup selects only already-loaded local Next assets and removes duplicates', () => {
  const boot = `${origin}/_next/static/chunks/boot-a.js`;
  const style = `${origin}/_next/static/chunks/style-a.css`;
  assert.deepEqual(loadedStaticAssetUrls([
    boot, boot, `${boot}#again`, style,
    `${origin}/api/me`, `${origin}/?screen=profile`, `${boot}.map`,
    `${origin}/fonts/Figtree-latin.woff2`, 'https://other.test/_next/static/chunks/boot.js',
    'http://[',
  ], origin), [boot, style]);
});

test('warmup is limited to 48 assets without inventing resource URLs', () => {
  const urls = Array.from({ length: 80 }, (_, n) => `${origin}/_next/static/chunks/file-${n}.js`);
  assert.deepEqual(loadedStaticAssetUrls(urls, origin), urls.slice(0, 48));
  assert.deepEqual(loadedStaticAssetUrls([], origin), []);
});
