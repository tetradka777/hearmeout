import { test, expect } from '@playwright/test';
import { expectNoHorizontalScroll, screen, watchErrors } from './helpers';
import { TEST_USER_ID } from './global-setup';

// Every main screen opens from a link, shows content, has no page errors
// or failed API calls, and doesn't scroll sideways (on the phone project).
const SCREENS: [string, string][] = [
  ['home', '/'],
  ['album', '/?screen=rate&id=ok-computer'],
  ['history', '/?screen=history'],
  ['recap', `/?screen=recap&id=${TEST_USER_ID}`],
  ['profile', '/?screen=profile'],
  ['artist', '/?screen=artist&id=4Z8W4fKeB5YxbusRsdQVPb&source=spotify&name=Radiohead'],
  ['match', '/?screen=match'],
  ['stats', '/?screen=stats'],
  ['groups', '/?screen=groups'],
  ['discover', '/?screen=discover'],
  ['settings', '/?screen=settings'],
  ['later', '/?screen=later'],
];

for (const [name, url] of SCREENS) {
  test(`${name} opens cleanly`, async ({ page }) => {
    const { errors } = watchErrors(page);
    await page.goto(url);
    const view = screen(page);
    await expect(view.locator('h1').first()).toBeAttached();
    await expect(view.locator('.tile').first()).toBeVisible();
    await expect(view).not.toHaveText(/^\s*$/);
    await page.waitForTimeout(1500); // late requests
    await expectNoHorizontalScroll(page);
    expect(errors).toEqual([]);
  });
}
