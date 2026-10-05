import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleIlikePattern, slugifyHandle } from './slug';

test('slugifyHandle keeps typed underscores and turns spaces into them', () => {
  assert.equal(slugifyHandle('test_account1'), 'test_account1');
  assert.equal(slugifyHandle('Ivan Petrov'), 'ivan_petrov');
  assert.equal(slugifyHandle('  Мира!  '), 'мира');
  assert.equal(slugifyHandle('!!!'), 'user');
  assert.equal(slugifyHandle('a'.repeat(40)).length, 24);
});

test('handleIlikePattern escapes LIKE wildcards and adds @', () => {
  assert.equal(handleIlikePattern('a_b'), String.raw`@a\_b`);
  assert.equal(handleIlikePattern('@100%'), String.raw`@100\%`);
  assert.equal(handleIlikePattern(String.raw` back\slash `), String.raw`@back\\slash`);
});
