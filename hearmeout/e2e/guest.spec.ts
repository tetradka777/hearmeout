import { test, expect } from '@playwright/test';
import { watchErrors } from './helpers';

// Signed out: the landing page and the sign-in form. No account is created.
test.use({ storageState: { cookies: [], origins: [] } });

test('landing page and a wrong password', async ({ page }) => {
  const { errors } = watchErrors(page);
  await page.goto('/?auth=login');
  const handle = page.locator('#au1');
  await expect(handle).toBeVisible();
  await handle.fill('e2e-no-such-user');
  await page.locator('#au2').fill('definitely-wrong-password');
  await page.locator('#au2').press('Enter');
  // The form says the sign-in failed and stays signed out.
  await expect(page.locator('[role="alert"], .ferr').first()).toBeVisible();
  expect((await page.request.get('/api/me')).status()).toBe(401);
  expect(errors).toEqual([]);
});

test('link preview and security headers', async ({ request }) => {
  const res = await request.get('/', { headers: { 'Accept-Language': '' } });
  const html = await res.text();
  expect(html).toContain('og:image');
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
  expect(res.headers()['x-frame-options']).toBe('SAMEORIGIN');
  // Upstream proxies need a session.
  expect((await request.get('/api/deezer/preview?artist=a&title=b')).status()).toBe(401);
});
