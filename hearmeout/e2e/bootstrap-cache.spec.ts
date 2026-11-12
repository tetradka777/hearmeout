import { test, expect } from '@playwright/test';

test('fresh previous-owner collections are cleared and fetched for the confirmed cookie owner', async ({ page, request }) => {
  test.setTimeout(60000);
  const me = await (await request.get('/api/me')).json();
  me.tzOffset = new Date().getTimezoneOffset();
  await page.addInitScript(({ me }) => {
    // Previous account exists only in this isolated browser fixture; no database writes.
    const old = { ...me, id: 'previous-owner-fixture', name: 'previous owner' };
    localStorage.setItem('hmo-json-owner', old.id);
    localStorage.setItem('hmo-json-v1:' + old.id, JSON.stringify({
      '/api/me': { at: Date.now(), data: old },
      '/api/ratings/mine': { at: Date.now(), data: [{ albumId: 'ok-computer', stars: 0.1, createdAt: new Date().toISOString(), tags: [], review: null }] },
      '/api/loved': { at: Date.now(), data: { items: [] } },
      '/api/later': { at: Date.now(), data: { items: [] } },
      '/api/albums/summary': { at: Date.now(), data: [] },
    }));
  }, { me });
  const reads = new Map<string, number>();
  await page.route('**/api/**', async route => {
    if (route.request().method() !== 'GET') return route.abort();
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/me') { await new Promise(r => setTimeout(r, 800)); return route.fulfill({ json: me }); }
    if (['/api/ratings/mine', '/api/loved', '/api/later', '/api/albums/summary'].includes(path)) {
      reads.set(path, (reads.get(path) ?? 0) + 1);
      await new Promise(r => setTimeout(r, 500));
      return route.fulfill({ json: path === '/api/loved' || path === '/api/later' ? { items: [] } : [] });
    }
    return route.continue();
  });
  await page.goto('/?screen=profile', { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await expect(page.locator('.pcnt:visible .num').first()).toHaveText('0');
  await expect.poll(() => [...reads.values()].reduce((a, b) => a + b, 0)).toBe(4);
  await page.waitForTimeout(700);
  await expect(page.locator('.pcnt:visible .num').first()).toHaveText('0');
  expect(await page.evaluate(() => localStorage.getItem('hmo-json-owner'))).toBe(me.id);
});
