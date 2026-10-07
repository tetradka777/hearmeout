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

// A translation may use fewer variables than English (a language can drop
// a count it doesn't need), never one the code doesn't pass. Inline plural
// forms {n|one|few|many} count as the variable n: three forms in Russian,
// two (one|other) elsewhere.
test('every key is translated in every language, with known placeholders', () => {
  const vars = (s: string) => new Set([...s.matchAll(/\{(\w+)(?:\|[^}]*)?\}/g)].map((m) => m[1]));
  for (const key of keys) {
    const ref = vars(translate('en', key));
    for (const lang of LANGUAGES as readonly Language[]) {
      const text = translate(lang, key);
      assert.ok(text && text !== key, `${lang}: ${key} missing`);
      for (const v of vars(text)) assert.ok(ref.has(v), `${lang}: ${key} uses {${v}}, which English doesn't`);
      for (const m of text.matchAll(/\{\w+\|([^}]*)\}/g)) {
        assert.equal(m[1].split('|').length, lang === 'ru' ? 3 : 2, `${lang}: ${key} plural forms`);
      }
      assert.equal(text.replace(/\{\w+(?:\|[^}]*)?\}/g, '').match(/[{}]/), null, `${lang}: ${key} stray brace`);
    }
  }
});

test('inline plurals', () => {
  assert.equal(translate('ru', 'time.yearsAgo', { n: 1 }), '1 год назад');
  assert.equal(translate('ru', 'time.yearsAgo', { n: 3 }), '3 года назад');
  assert.equal(translate('ru', 'time.yearsAgo', { n: 11 }), '11 лет назад');
  assert.equal(translate('fr', 'time.yearsAgo', { n: 1 }), 'il y a 1 an');
  assert.equal(translate('fr', 'time.yearsAgo', { n: 2 }), 'il y a 2 ans');
  // An already formatted count picks its form by value.
  assert.equal(translate('fr', 'artist.fansCount', { count: '1' }), '1 fan sur Deezer');
  assert.equal(translate('fr', 'artist.fansCount', { count: '4 101 238' }), '4 101 238 fans sur Deezer');
  assert.equal(translate('es', 'artist.fansCount', { count: '1.234' }), '1.234 fans en Deezer');
});

test('pickLanguage', () => {
  assert.equal(pickLanguage(['de-AT', 'en']), 'de');
  assert.equal(pickLanguage('fr-CA,fr;q=0.9,en;q=0.8'), 'fr');
  assert.equal(pickLanguage(['ja', 'it']), 'en');
  assert.equal(pickLanguage(null), 'en');
});
