import { wordsMatch, levenshtein } from './voice-matching.js';

// Wake words: «суфлёр» — историческое; «speech» — короткий и надёжный
// для русского STT, потому что произносится как «спич» и редко
// сливается с другими словами.
const WAKE_WORDS = ['суфлер', 'speech'];

const SINGLE_COMMANDS = {
  стоп: { action: 'pause' },
  стой: { action: 'pause' },
  пауза: { action: 'pause' },
  замри: { action: 'pause' },
  старт: { action: 'play' },
  играй: { action: 'play' },
  играть: { action: 'play' },
  плей: { action: 'play' },
  слушай: { action: 'play' },
  поехали: { action: 'play' },
  вперед: { action: 'play' },
  продолжай: { action: 'play' },
  сначала: { action: 'reset' },
  заново: { action: 'reset' },
  начало: { action: 'reset' },
  больше: { action: 'fontUp' },
  крупнее: { action: 'fontUp' },
  меньше: { action: 'fontDown' },
  мельче: { action: 'fontDown' },
};

// Удвоенные слова, которые сами по себе считаются командой — без wake.
// Удвоение почти не встречается в живой речи, поэтому ложные срабатывания
// маловероятны, а пользователю проще сказать «стоп стоп», чем выдавливать
// «суфлёр стоп».
//
// Намеренно не добавляем тут «давай», «хватит», «тише» — это слишком
// частые удвоения в обычной речи, словили бы false-positive.
const DOUBLE_COMMANDS = {
  стоп: { action: 'pause' },
  стой: { action: 'pause' },
  пауза: { action: 'pause' },
  замри: { action: 'pause' },
  старт: { action: 'play' },
  поехали: { action: 'play' },
  вперед: { action: 'play' },
  слушай: { action: 'play' },
  играй: { action: 'play' },
  продолжай: { action: 'play' },
  сначала: { action: 'reset' },
  заново: { action: 'reset' },
  начало: { action: 'reset' },
};

function isWakeWord(token) {
  if (!token) return false;
  for (const wake of WAKE_WORDS) {
    if (token === wake) return true;
    const minLen = Math.min(token.length, wake.length);
    if (minLen < 4) continue;
    // Более щадящий tolerance именно для wake — чтобы «сюрфлер»,
    // «суфлеро», «спич» (вместо «speech») засчитывались.
    const tolerance = Math.max(2, Math.floor(minLen / 3));
    if (levenshtein(token, wake) <= tolerance) return true;
  }
  return false;
}

function findDoubleCommand(tokens) {
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (!wordsMatch(a, b)) continue;
    for (const [canonical, cmd] of Object.entries(DOUBLE_COMMANDS)) {
      if (wordsMatch(a, canonical) || wordsMatch(b, canonical)) {
        return {
          action: cmd.action,
          consumedFrom: i,
          consumedTo: i + 2,
          label: `${canonical} ${canonical}`,
        };
      }
    }
  }
  return null;
}

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

  // 1. Удвоенные команды («стоп стоп», «старт старт») — приоритет,
  // потому что их проще произнести и они не требуют wake word.
  const doubleCmd = findDoubleCommand(tokens);
  if (doubleCmd) return doubleCmd;

  // 2. Wake word + команда («суфлёр стоп», «speech стоп»)
  let wakeIdx = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (isWakeWord(tokens[i])) {
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
