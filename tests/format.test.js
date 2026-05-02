import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  escapeHtml,
  formatRelative,
  makePreview,
  wordCount,
  pluralize,
  wordsLabel,
} from '../src/lib/format.js';

test('escapeHtml: спецсимволы экранируются', () => {
  assert.equal(
    escapeHtml('<script>alert("xss")</script>'),
    '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
  );
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
  assert.equal(escapeHtml("I'm here"), 'I&#39;m here');
});

test('formatRelative: только что для свежих', () => {
  const now = 1_700_000_000_000;
  assert.equal(formatRelative(now - 5_000, now), 'только что');
  assert.equal(formatRelative(now - 29_000, now), 'только что');
});

test('formatRelative: минуты', () => {
  const now = 1_700_000_000_000;
  assert.equal(formatRelative(now - 60_000, now), '1 мин');
  assert.equal(formatRelative(now - 30 * 60_000, now), '30 мин');
});

test('formatRelative: часы', () => {
  const now = 1_700_000_000_000;
  assert.equal(formatRelative(now - 3 * 3_600_000, now), '3 ч');
  assert.equal(formatRelative(now - 23 * 3_600_000, now), '23 ч');
});

test('formatRelative: вчера', () => {
  const now = 1_700_000_000_000;
  assert.equal(formatRelative(now - 25 * 3_600_000, now), 'вчера');
  assert.equal(formatRelative(now - 47 * 3_600_000, now), 'вчера');
});

test('formatRelative: дни', () => {
  const now = 1_700_000_000_000;
  assert.equal(formatRelative(now - 3 * 86_400_000, now), '3 дн');
});

test('formatRelative: дата для старых', () => {
  const now = new Date('2024-05-15T10:00:00Z').getTime();
  const old = new Date('2024-04-01T10:00:00Z').getTime();
  const result = formatRelative(old, now);
  assert.match(result, /^\d{1,2} [а-я]{3}$/);
});

test('makePreview: нормализует пробелы и обрезает', () => {
  assert.equal(makePreview('hello   world\n\nfoo'), 'hello world foo');
  const long = 'word '.repeat(50).trim();
  const preview = makePreview(long, 20);
  assert.ok(preview.length <= 21);
  assert.ok(preview.endsWith('…'));
});

test('makePreview: короткий текст не трогает', () => {
  assert.equal(makePreview('short'), 'short');
});

test('makePreview: пустой остаётся пустым', () => {
  assert.equal(makePreview(''), '');
  assert.equal(makePreview('   '), '');
});

test('wordCount: считает слова', () => {
  assert.equal(wordCount(''), 0);
  assert.equal(wordCount('one'), 1);
  assert.equal(wordCount('one two three'), 3);
  assert.equal(wordCount('  one   two  '), 2);
  assert.equal(wordCount('многострочный\nтекст\nтри слова'), 4);
});

test('pluralize: русские формы', () => {
  const forms = { one: 'минута', few: 'минуты', many: 'минут', other: 'минут' };
  assert.equal(pluralize(1, forms), 'минута');
  assert.equal(pluralize(2, forms), 'минуты');
  assert.equal(pluralize(5, forms), 'минут');
  assert.equal(pluralize(11, forms), 'минут');
  assert.equal(pluralize(21, forms), 'минута');
  assert.equal(pluralize(22, forms), 'минуты');
});

test('wordsLabel: формы для "слово"', () => {
  assert.equal(wordsLabel(1), 'слово');
  assert.equal(wordsLabel(2), 'слова');
  assert.equal(wordsLabel(5), 'слов');
  assert.equal(wordsLabel(21), 'слово');
});
