import { test, expect } from '@playwright/test';
import { accountLanguage, screen, tr, watchErrors } from './helpers';

// The main things people do. Each test puts back what it changes.

test('stats: a period seen before shows at once', async ({ page }) => {
  const { errors } = watchErrors(page);
  const lang = await accountLanguage(page);
  await page.goto('/?screen=stats');
  const view = screen(page);
  const loading = view.getByText(tr(lang, 'stats.loading'));
  await expect(loading).toHaveCount(0, { timeout: 30_000 });
  await view.getByRole('button', { name: tr(lang, 'stats.periodMonth'), exact: true }).click();
  await expect(loading).toHaveCount(0, { timeout: 30_000 });
  await view.getByRole('button', { name: tr(lang, 'stats.periodWeek'), exact: true }).click();
  // Back to the week: from the session cache, no loading line at all.
  await expect(loading).toHaveCount(0, { timeout: 500 });
  expect(errors).toEqual([]);
});

test('rate an album and put the rating back', async ({ page }) => {
  const { errors } = watchErrors(page);
  const lang = await accountLanguage(page);
  const mine: { albumId: string; stars: number; review: string | null; tags: string[] | null; isPrivate: boolean }[] =
    await (await page.request.get('/api/ratings/mine')).json();
  const before = mine.find((r) => /^[a-z0-9-]+$/.test(r.albumId));
  test.skip(!before, 'the test account has no catalog rating to change');

  await page.goto(`/?screen=rate&id=${before!.albumId}`);
  const slider = screen(page).getByRole('slider').first();
  await expect(slider).toBeVisible();
  await slider.focus();
  // A different score than now: down by 0.3 (or up if near the bottom).
  const key = before!.stars > 1 ? 'ArrowLeft' : 'ArrowRight';
  for (let i = 0; i < 3; i++) await slider.press(key);
  await screen(page).getByRole('button', { name: new RegExp(`^(${tr(lang, 'rate.save')}|${tr(lang, 'rate.publish')})`) }).click();
  await expect.poll(async () => {
    const now: typeof mine = await (await page.request.get('/api/ratings/mine')).json();
    return now.find((r) => r.albumId === before!.albumId)?.stars;
  }).not.toBe(before!.stars);

  // Put it back as it was.
  const res = await page.request.post('/api/ratings', { data: { albumId: before!.albumId, stars: before!.stars, review: before!.review ?? '', tags: before!.tags ?? [], isPrivate: before!.isPrivate } });
  expect(res.ok()).toBeTruthy();
  expect(errors).toEqual([]);
});

test('create a group and leave it', async ({ page }) => {
  const { errors } = watchErrors(page);
  const lang = await accountLanguage(page);
  const name = `e2e ${Date.now() % 100000}`;
  await page.goto('/?screen=groups');
  await screen(page).getByRole('button', { name: tr(lang, 'groups.newGroup') }).first().click();
  await page.locator('#gname').fill(name);
  await page.locator('#gname').press('Enter');
  // The group is there.
  let groupId: string | undefined;
  await expect.poll(async () => {
    const groups: { id: string; name: string }[] = await (await page.request.get('/api/groups')).json();
    groupId = groups.find((g) => g.name === name)?.id;
    return groupId;
  }).toBeTruthy();
  // Leave: as the last member, the group is removed.
  expect((await page.request.post(`/api/groups/${groupId}/leave`)).ok()).toBeTruthy();
  const after: { id: string }[] = await (await page.request.get('/api/groups')).json();
  expect(after.some((g) => g.id === groupId)).toBe(false);
  expect(errors).toEqual([]);
});

test('switching to dark mode recolours muted text', async ({ page }) => {
  await page.goto('/?screen=stats');
  const muted = screen(page).locator('.muted').first();
  await expect(muted).toBeVisible();
  const before = await page.evaluate(() => document.documentElement.dataset.mode);
  const toggle = page.locator('.rd .topr button:not([aria-haspopup])').filter({ visible: true }).first();
  await toggle.click();
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.mode)).not.toBe(before);
  // Muted text follows the new text colour (parent and muted share the RGB).
  const [parent, own] = await muted.evaluate((el) => [getComputedStyle(el.parentElement!).color, getComputedStyle(el).color]);
  const rgb = (c: string) => (c.match(/[\d.]+/g) || []).slice(0, 3).map((x) => Math.round(Number(x) <= 1 && c.startsWith('color(') ? Number(x) * 255 : Number(x)));
  expect(rgb(own)).toEqual(rgb(parent));
  await toggle.click(); // back
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.mode)).toBe(before);
});
