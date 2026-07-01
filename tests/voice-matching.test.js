import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  tokenize,
  levenshtein,
  wordsMatch,
  scoreAlignment,
  findBestPosition,
  findBestPositionInRange,
} from '../src/lib/voice-matching.js';

test('tokenize: русский, нижний регистр, ё→е, без пунктуации', () => {
  assert.deepEqual(tokenize('Привет, мир!'), ['привет', 'мир']);
  assert.deepEqual(tokenize('Ёлка ёжик'), ['елка', 'ежик']);
  assert.deepEqual(tokenize('foo-bar baz'), ['foo', 'bar', 'baz']);
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize(null), []);
  assert.deepEqual(tokenize('   '), []);
});

test('tokenize: сохраняет порядок и числа', () => {
  assert.deepEqual(tokenize('1 2 три'), ['1', '2', 'три']);
});

test('levenshtein: базовые случаи', () => {
  assert.equal(levenshtein('', ''), 0);
  assert.equal(levenshtein('abc', 'abc'), 0);
  assert.equal(levenshtein('', 'abc'), 3);
  assert.equal(levenshtein('abc', ''), 3);
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('привет', 'превед'), 2);
});

test('wordsMatch: точное совпадение всегда true', () => {
  assert.equal(wordsMatch('слово', 'слово'), true);
});

test('wordsMatch: короткие слова требуют точного совпадения', () => {
  assert.equal(wordsMatch('и', 'я'), false);
  assert.equal(wordsMatch('но', 'на'), false);
});

test('wordsMatch: длинные слова с одной опечаткой', () => {
  assert.equal(wordsMatch('привет', 'привед'), true);
  assert.equal(wordsMatch('сегодня', 'севодня'), true);
});

test('wordsMatch: слишком много отличий — false', () => {
  assert.equal(wordsMatch('кошка', 'собака'), false);
});

test('scoreAlignment: идеальное совпадение → 1', () => {
  const script = ['это', 'тестовый', 'скрипт', 'для', 'проверки'];
  const buffer = ['тестовый', 'скрипт'];
  // hypothesizedEnd=2 значит "buffer заканчивается на script[2]"
  // Тогда buffer[0]='тестовый' должен быть на script[1], buffer[1]='скрипт' на script[2]
  assert.equal(scoreAlignment(script, buffer, 2), 1);
});

test('scoreAlignment: несовпадение → 0', () => {
  const script = ['один', 'два', 'три'];
  const buffer = ['кот', 'пёс'];
  assert.equal(scoreAlignment(script, buffer, 1), 0);
});

test('scoreAlignment: пустой буфер → 0', () => {
  assert.equal(scoreAlignment(['а', 'б'], [], 1), 0);
});

test('findBestPosition: находит в окне', () => {
  const script = tokenize('здравствуйте друзья сегодня я расскажу про распознавание речи');
  // буфер: "сегодня я расскажу" — должно совпасть на позиции 4 (индекс слова "расскажу")
  const buffer = tokenize('сегодня я расскажу');
  const result = findBestPosition(script, buffer, 0, 20);
  assert.ok(result.score > 0.6, `score должен быть > 0.6, получили ${result.score}`);
  assert.equal(script[result.pos], 'расскажу');
});

test('findBestPosition: пропускает мисс-распознанное слово', () => {
  const script = tokenize('один два три четыре пять шесть');
  // распознали "два три тири четыре" — "тири" опечатка от "три"
  const buffer = tokenize('два три тири четыре');
  const result = findBestPosition(script, buffer, 0, 20);
  // должно прокрутить дальше — найти "четыре"
  assert.equal(script[result.pos], 'четыре');
  assert.ok(result.score >= 0.5);
});

test('findBestPosition: курсор только идёт вперёд (limited window)', () => {
  const script = tokenize('старт средина конец и потом ещё много слов далеко');
  const buffer = tokenize('много слов');
  // курсор уже на 4, окно lookahead 5 — должны найти "много слов"
  const result = findBestPosition(script, buffer, 4, 5);
  assert.equal(script[result.pos], 'слов');
});

test('findBestPosition: пустой скрипт', () => {
  const result = findBestPosition([], ['что', 'то'], 0, 20);
  assert.equal(result.score, 0);
});

test('findBestPosition: пустой буфер', () => {
  const result = findBestPosition(['а', 'б'], [], 0, 20);
  assert.equal(result.score, 0);
});

test('findBestPositionInRange: возвращает unique = число разных совпавших слов', () => {
  const script = tokenize('один два три четыре пять');
  const buffer = tokenize('два три четыре');
  const r = findBestPositionInRange(script, buffer, 0, 5);
  assert.equal(r.unique, 3);
  assert.ok(r.score >= 0.99);
});

test('findBestPositionInRange: повтор одного слова даёт unique=1', () => {
  // буфер из одинаковых слов даже при идеальном score нечитаем как
  // «осмысленный кусок» — для backward jump unique=1 не должно проходить.
  const script = tokenize('а а а а а конец');
  const buffer = ['а', 'а', 'а', 'а', 'а'];
  const r = findBestPositionInRange(script, buffer, 0, 6);
  assert.equal(r.unique, 1);
});

test('findBestPositionInRange: пустой диапазон → score=0', () => {
  const r = findBestPositionInRange(['а', 'б', 'в'], ['а'], 5, 5);
  assert.equal(r.score, 0);
  assert.equal(r.unique, 0);
});

test('findBestPositionInRange: backward сценарий — возвращение в прошлый абзац', () => {
  // Имитируем длинный скрипт. Пользователь был на cursor=20, но начал
  // читать с позиции 5. Поиск в окне [0, 20) должен найти match.
  const script = tokenize(
    'когда я был молодым ещё ничего не знал о жизни и думал что всё будет ' +
      'легко и просто но потом оказалось всё сложнее многое пришлось переосмыслить',
  );
  const buffer = tokenize('я был молодым ещё ничего');
  const cursor = 20;
  const r = findBestPositionInRange(script, buffer, 0, cursor);
  assert.ok(r.score >= 0.7, `score ${r.score}`);
  assert.ok(r.unique >= 3, `unique ${r.unique}`);
  assert.ok(r.pos < cursor, 'найдена позиция назад');
});

test('findBestPositionInRange: импровизация — низкий score, не триггерит backward', () => {
  const script = tokenize('один два три четыре пять шесть семь восемь девять десять');
  const buffer = tokenize('кошка собака бегает');
  const r = findBestPositionInRange(script, buffer, 0, 10);
  assert.ok(r.score < 0.4, `score ${r.score} должен быть низкий`);
});

test('findBestPositionInRange: при ничьей по умолчанию побеждает ближайшая к startIdx', () => {
  // Фраза повторяется дважды — оба вхождения дают score=1 (настоящая
  // «ничья»). Без preferNearEnd побеждает первое (ближе к началу диапазона).
  const script = tokenize(
    'привет друзья сегодня расскажу привет друзья сегодня расскажу конец',
  );
  const buffer = tokenize('привет друзья сегодня расскажу');
  const r = findBestPositionInRange(script, buffer, 0, script.length);
  assert.equal(r.score, 1);
  assert.equal(r.pos, 3, 'ближайшее к startIdx вхождение');
});

test('findBestPositionInRange: preferNearEnd — при ничьей побеждает ближайшая к endIdx', () => {
  const script = tokenize(
    'привет друзья сегодня расскажу привет друзья сегодня расскажу конец',
  );
  const buffer = tokenize('привет друзья сегодня расскажу');
  const r = findBestPositionInRange(script, buffer, 0, script.length, {
    preferNearEnd: true,
  });
  assert.equal(r.score, 1);
  assert.equal(r.pos, 7, 'ближайшее к endIdx вхождение');
});
