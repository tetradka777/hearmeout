import { expect, type Page } from '@playwright/test';
import { translate, type Language, type TranslationKey } from '../src/lib/i18n';

// Page errors and failed API calls (5xx) collected while a test runs; a
// test asserts they stayed empty.
export function watchErrors(page: Page): { errors: string[] } {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 500) errors.push(`${r.status()} ${new URL(r.url()).pathname}`);
  });
  return { errors };
}

// The signed-in account's language, so tests can find buttons by the same
// text the app shows.
export async function accountLanguage(page: Page): Promise<Language> {
  const me = await (await page.request.get('/api/me')).json();
  return (me.language || 'en') as Language;
}

export function tr(lang: Language, key: TranslationKey, vars?: Record<string, string | number>): string {
  return translate(lang, key, vars);
}

// The visible screen inside the app shell.
export function screen(page: Page) {
  return page.locator('.rd main > div:not([style*="display: none"])');
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(1);
}
