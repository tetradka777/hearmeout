import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, pickLanguage, translate, type Language, type TranslationKey } from './i18n';
import fs from 'node:fs';
import path from 'node:path';

// The dictionaries aren't exported; probe them through translate(): every
// key of the reference (ru) set must translate to a non-empty string that
// isn't the key itself, and keep the same {placeholders} in every language.
const keys = (() => {
  const src = fs.readFileSync(path.join(__dirname, 'i18n.ts'), 'utf8');
  const ru = src.slice(src.indexOf('const ru = {'), src.indexOf('\n};', src.indexOf('const ru = {')));
  return [...ru.matchAll(/^ {2}'([^']+)':/gm)].map((m) => m[1] as TranslationKey);
})();

test('dictionary keys were found', () => assert.ok(keys.length > 500, `only ${keys.length} keys`));

test('every key is translated in every language, with the same placeholders', () => {
  const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const key of keys) {
    const ref = vars(translate('ru', key));
    for (const lang of LANGUAGES as readonly Language[]) {
      const text = translate(lang, key);
      assert.ok(text && text !== key, `${lang}: ${key} missing`);
      assert.equal(vars(text), ref, `${lang}: ${key} placeholders differ`);
    }
  }
});

test('pickLanguage', () => {
  assert.equal(pickLanguage(['de-AT', 'en']), 'de');
  assert.equal(pickLanguage('fr-CA,fr;q=0.9,en;q=0.8'), 'fr');
  assert.equal(pickLanguage(['ja', 'it']), 'en');
  assert.equal(pickLanguage(null), 'en');
});
