import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tokenize } from '../src/lib/voice-matching.js';
import {
  detectCommand,
  parseNumber,
  parseNumberPhrase,
} from '../src/lib/voice-commands.js';

test('parseNumber: цифры', () => {
  assert.equal(parseNumber('0'), 0);
  assert.equal(parseNumber('10'), 10);
  assert.equal(parseNumber('123'), 123);
  assert.equal(parseNumber('абв'), null);
  assert.equal(parseNumber(''), null);
});

test('parseNumber: русские числа', () => {
  assert.equal(parseNumber('один'), 1);
  assert.equal(parseNumber('пять'), 5);
  assert.equal(parseNumber('десять'), 10);
  assert.equal(parseNumber('двадцать'), 20);
  assert.equal(parseNumber('сто'), 100);
});

test('parseNumberPhrase: одно слово', () => {
  assert.deepEqual(parseNumberPhrase(['10']), { value: 10, length: 1 });
  assert.deepEqual(parseNumberPhrase(['пять']), { value: 5, length: 1 });
});

test('parseNumberPhrase: составные русские числа', () => {
  assert.deepEqual(parseNumberPhrase(['двадцать', 'пять']), {
    value: 25,
    length: 2,
  });
  assert.deepEqual(parseNumberPhrase(['тридцать', 'три']), {
    value: 33,
    length: 2,
  });
});

test('parseNumberPhrase: не составное — берёт первое', () => {
  // десять + пять — не складываются (10 не круглое десятки 20-90)
  assert.deepEqual(parseNumberPhrase(['десять', 'пять']), {
    value: 10,
    length: 1,
  });
});

test('detectCommand: пусто или нет wake-слова', () => {
  assert.equal(detectCommand([]), null);
  assert.equal(detectCommand(['хочу', 'кушать']), null);
  assert.equal(detectCommand(['суфлер']), null); // без команды
});

test('detectCommand: суфлер стоп → pause', () => {
  const cmd = detectCommand(tokenize('суфлёр стоп'));
  assert.equal(cmd.action, 'pause');
  assert.equal(cmd.label, 'стоп');
});

test('detectCommand: суфлёр пауза → pause', () => {
  const cmd = detectCommand(tokenize('суфлёр пауза'));
  assert.equal(cmd.action, 'pause');
});

test('detectCommand: суфлер старт → play', () => {
  assert.equal(detectCommand(tokenize('суфлёр старт')).action, 'play');
  assert.equal(detectCommand(tokenize('суфлёр играй')).action, 'play');
});

test('detectCommand: суфлер сначала → reset', () => {
  assert.equal(detectCommand(tokenize('суфлёр сначала')).action, 'reset');
  assert.equal(detectCommand(tokenize('суфлёр заново')).action, 'reset');
});

test('detectCommand: команды скорости отключены — пользователь крутит пальцами', () => {
  // Скорость регулируется тапами в зонах суфлёра или sliderом в настройках,
  // а в голосовом режиме текст и так подстраивается под темп речи.
  // Если кто-то скажет «суфлёр быстрее» — ничего не должно произойти.
  assert.equal(detectCommand(tokenize('суфлёр быстрее')), null);
  assert.equal(detectCommand(tokenize('суфлёр медленнее')), null);
  assert.equal(detectCommand(tokenize('суфлёр скорее')), null);
});

test('detectCommand: суфлер больше / меньше', () => {
  assert.equal(detectCommand(tokenize('суфлёр больше')).action, 'fontUp');
  assert.equal(detectCommand(tokenize('суфлёр меньше')).action, 'fontDown');
});

test('detectCommand: суфлер назад на 10', () => {
  const cmd = detectCommand(tokenize('суфлёр назад на 10'));
  assert.equal(cmd.action, 'rewind');
  assert.equal(cmd.amount, 10);
  assert.equal(cmd.label, 'назад на 10');
});

test('detectCommand: суфлер назад 5 (без "на")', () => {
  const cmd = detectCommand(tokenize('суфлёр назад 5'));
  assert.equal(cmd.action, 'rewind');
  assert.equal(cmd.amount, 5);
});

test('detectCommand: суфлер назад на двадцать пять', () => {
  const cmd = detectCommand(tokenize('суфлёр назад на двадцать пять'));
  assert.equal(cmd.action, 'rewind');
  assert.equal(cmd.amount, 25);
});

test('detectCommand: префикс игнорируется, важен последний "суфлер"', () => {
  const cmd = detectCommand(tokenize('читаем какой-то текст суфлёр стоп'));
  assert.equal(cmd.action, 'pause');
});

test('detectCommand: consume range исключает команду из основного буфера', () => {
  const tokens = tokenize('пример текста суфлёр стоп');
  // ["пример", "текста", "суфлер", "стоп"]
  const cmd = detectCommand(tokens);
  assert.equal(cmd.consumedFrom, 2);
  assert.equal(cmd.consumedTo, 4);
});

test('detectCommand: fuzzy match wake-слова', () => {
  // "суфле" — Левенштейн 1, должно поймать
  const cmd = detectCommand(tokenize('суфле стоп'));
  assert.equal(cmd?.action, 'pause');
});

test('detectCommand: команды требуют точного совпадения', () => {
  // "стон" вместо "стоп" — не должно ловиться
  assert.equal(detectCommand(tokenize('суфлёр стон')), null);
});

test('detectCommand: только wake-слово без команды → null', () => {
  assert.equal(detectCommand(tokenize('суфлёр')), null);
});

test('detectCommand: удвоение «стоп стоп» → pause без wake', () => {
  assert.equal(detectCommand(tokenize('стоп стоп')).action, 'pause');
  assert.equal(detectCommand(tokenize('пауза пауза')).action, 'pause');
});

test('detectCommand: удвоение «старт старт» / «поехали поехали» → play', () => {
  assert.equal(detectCommand(tokenize('старт старт')).action, 'play');
  assert.equal(detectCommand(tokenize('поехали поехали')).action, 'play');
});

test('detectCommand: удвоение «сначала сначала» → reset', () => {
  assert.equal(detectCommand(tokenize('сначала сначала')).action, 'reset');
  assert.equal(detectCommand(tokenize('заново заново')).action, 'reset');
});

test('detectCommand: удвоение находится в середине фразы', () => {
  // Пользователь читает текст и вставляет команду между словами.
  const cmd = detectCommand(tokenize('читаем дальше стоп стоп остальное'));
  assert.equal(cmd.action, 'pause');
});

test('detectCommand: одиночное «стоп» без удвоения и без wake → null', () => {
  // Защита от ложных срабатываний на «стоп» в скрипте.
  assert.equal(detectCommand(tokenize('и тогда я сказал стоп')), null);
});

test('detectCommand: разные слова рядом — не команда', () => {
  // «стоп старт» — это не удвоение, ничего не делает.
  assert.equal(detectCommand(tokenize('стоп старт')), null);
});

test('detectCommand: speech как альтернативный wake', () => {
  assert.equal(detectCommand(tokenize('speech стоп')).action, 'pause');
  assert.equal(detectCommand(tokenize('speech старт')).action, 'play');
});

test('detectCommand: толерантность к опечаткам wake-слова', () => {
  // Реальные мисс-распознавания «суфлёр» от русского STT.
  assert.equal(detectCommand(tokenize('сюрфлер стоп'))?.action, 'pause');
  assert.equal(detectCommand(tokenize('суфлеро стоп'))?.action, 'pause');
});
