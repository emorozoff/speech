import { wordsMatch } from './voice-matching.js';

const WAKE_WORD = 'суфлер';

const SINGLE_COMMANDS = {
  стоп: { action: 'pause' },
  пауза: { action: 'pause' },
  старт: { action: 'play' },
  играй: { action: 'play' },
  играть: { action: 'play' },
  плей: { action: 'play' },
  слушай: { action: 'play' },
  сначала: { action: 'reset' },
  заново: { action: 'reset' },
  больше: { action: 'fontUp' },
  крупнее: { action: 'fontUp' },
  меньше: { action: 'fontDown' },
  мельче: { action: 'fontDown' },
};

const RU_NUMBERS = {
  ноль: 0,
  один: 1,
  одна: 1,
  два: 2,
  две: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
  девять: 9,
  десять: 10,
  одиннадцать: 11,
  двенадцать: 12,
  тринадцать: 13,
  четырнадцать: 14,
  пятнадцать: 15,
  шестнадцать: 16,
  семнадцать: 17,
  восемнадцать: 18,
  девятнадцать: 19,
  двадцать: 20,
  тридцать: 30,
  сорок: 40,
  пятьдесят: 50,
  шестьдесят: 60,
  семьдесят: 70,
  восемьдесят: 80,
  девяносто: 90,
  сто: 100,
};

export function parseNumber(token) {
  if (!token) return null;
  if (/^\d+$/.test(token)) return parseInt(token, 10);
  if (token in RU_NUMBERS) return RU_NUMBERS[token];
  return null;
}

export function parseNumberPhrase(tokens) {
  if (!tokens || tokens.length === 0) return null;
  const first = parseNumber(tokens[0]);
  if (first === null) return null;
  if (tokens.length >= 2) {
    const second = parseNumber(tokens[1]);
    if (
      second !== null &&
      first >= 20 &&
      first <= 90 &&
      first % 10 === 0 &&
      second >= 1 &&
      second <= 9
    ) {
      return { value: first + second, length: 2 };
    }
  }
  return { value: first, length: 1 };
}

export function detectCommand(tokens) {
  if (!tokens || tokens.length === 0) return null;

  let wakeIdx = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (wordsMatch(tokens[i], WAKE_WORD)) {
      wakeIdx = i;
      break;
    }
  }
  if (wakeIdx === -1) return null;

  const after = tokens.slice(wakeIdx + 1);
  if (after.length === 0) return null;

  if (after[0] === 'назад' && after.length >= 2) {
    let numStart = 1;
    if (after[1] === 'на' && after.length >= 3) numStart = 2;
    const numTokens = after.slice(numStart);
    const num = parseNumberPhrase(numTokens);
    if (num !== null && num.value > 0) {
      return {
        action: 'rewind',
        amount: num.value,
        consumedFrom: wakeIdx,
        consumedTo: wakeIdx + 1 + numStart + num.length,
        label: `назад на ${num.value}`,
      };
    }
  }

  const single = SINGLE_COMMANDS[after[0]];
  if (single) {
    return {
      action: single.action,
      consumedFrom: wakeIdx,
      consumedTo: wakeIdx + 2,
      label: after[0],
    };
  }

  return null;
}
