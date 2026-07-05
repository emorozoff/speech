import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// Подменяем Web Speech API фейком, чтобы проверять жизненный цикл
// микрофона (открыт/отпущен), а не само распознавание.
class FakeRecognition {
  constructor() {
    FakeRecognition.instances.push(this);
    this.started = 0;
    this.aborted = 0;
    this.stopped = 0;
    this.onresult = null;
    this.onend = null;
    this.onerror = null;
  }
  start() {
    if (FakeRecognition.failNext > 0) {
      FakeRecognition.failNext--;
      throw new Error('InvalidStateError');
    }
    this.started++;
  }
  stop() {
    this.stopped++;
  }
  abort() {
    this.aborted++;
  }
}
FakeRecognition.instances = [];
FakeRecognition.failNext = 0;

globalThis.window = { webkitSpeechRecognition: FakeRecognition };

const { VoiceFollower } = await import('../src/lib/voice-follower.js');

// mock.timers.tick() не «доматывает» таймеры, запланированные внутри уже
// сработавших колбэков (цепочки setTimeout). Крутим мелкими шагами, чтобы
// слить всю цепочку рестартов.
function advance(ms, step = 50) {
  for (let t = 0; t < ms; t += step) mock.timers.tick(step);
}

beforeEach(() => {
  FakeRecognition.instances = [];
  FakeRecognition.failNext = 0;
});

test('start открывает микрофон', () => {
  const v = new VoiceFollower({ scriptBody: 'один два три' });
  v.start();
  assert.equal(FakeRecognition.instances.length, 1);
  assert.equal(FakeRecognition.instances[0].started, 1);
  v.stop();
});

test('pause мягкий — микрофон остаётся горячим для голосовых команд', () => {
  const v = new VoiceFollower({ scriptBody: 'один два три' });
  v.start();
  const rec = FakeRecognition.instances[0];
  v.pause();
  assert.equal(v.followPaused, true);
  assert.equal(rec.aborted, 0, 'pause не отпускает микрофон');
  assert.equal(rec.stopped, 0);
  assert.ok(v.recognition, 'recognition остаётся живым, чтобы слышать «старт»');
  v.stop();
});

test('resume после мягкой паузы не переоткрывает живой микрофон', () => {
  const v = new VoiceFollower({ scriptBody: 'один два три' });
  v.start();
  v.pause();
  const count = FakeRecognition.instances.length;
  v.resume();
  assert.equal(v.followPaused, false);
  assert.equal(
    FakeRecognition.instances.length,
    count,
    'микрофон был жив — новый recognition не нужен',
  );
  v.stop();
});

test('resume оживляет «умерший» во время паузы микрофон (Bug 1)', () => {
  const v = new VoiceFollower({ scriptBody: 'один два три' });
  v.start();
  v.pause();
  // iOS сам закрыл recognition во время паузы и рестарт не поднял его:
  v._close();
  assert.equal(v.recognition, null);
  v.resume();
  assert.ok(v.recognition, 'resume переоткрыл микрофон');
  v.stop();
});

test('suspend отпускает микрофон и не воскрешает его в фоне (Bug 2)', () => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] });
  try {
    const v = new VoiceFollower({ scriptBody: 'один два три' });
    v.start();
    const rec = FakeRecognition.instances[0];
    v.suspend();
    assert.equal(rec.aborted, 1, 'микрофон отпущен немедленно через abort()');
    assert.equal(v.recognition, null, 'ссылка на recognition снята');
    const before = FakeRecognition.instances.length;
    // Прокручиваем время далеко за HEARTBEAT_TIMEOUT и RESTART_DELAY —
    // в свёрнутом приложении микрофон не должен воскресать.
    advance(30000);
    assert.equal(
      FakeRecognition.instances.length,
      before,
      'ни одного нового recognition в фоне',
    );
    v.stop();
  } finally {
    mock.timers.reset();
  }
});

test('resume после suspend поднимает микрофон заново (тап Play)', () => {
  const v = new VoiceFollower({ scriptBody: 'один два три' });
  v.start();
  v.suspend();
  assert.equal(v.recognition, null);
  v.resume();
  assert.ok(v.recognition, 'микрофон снова открыт');
  assert.equal(FakeRecognition.instances.at(-1).started, 1);
  v.stop();
});

test('heartbeat переоткрывает «застрявший» микрофон в активном режиме', () => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] });
  try {
    const v = new VoiceFollower({ scriptBody: 'один два три' });
    v.start();
    assert.equal(FakeRecognition.instances.length, 1);
    // Ни одного onresult: через таймаут heartbeat закрывает текущий
    // recognition и через RESTART_DELAY открывает новый.
    advance(7000);
    assert.equal(
      FakeRecognition.instances.length,
      2,
      'микрофон переоткрыт после «застревания»',
    );
    v.stop();
  } finally {
    mock.timers.reset();
  }
});

test('транзиентный сбой start() не гасит голос — переоткрывает', () => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] });
  let fatalCode = null;
  try {
    FakeRecognition.failNext = 2; // первые два start() бросают InvalidStateError
    const v = new VoiceFollower({
      scriptBody: 'один два три',
      onError: (_msg, code) => {
        fatalCode = code;
      },
    });
    v.start(); // попытка 1 — throw → запланирован рестарт
    advance(2000); // попытки 2..3: вторая throw, третья успешна
    assert.equal(fatalCode, null, 'голос не выключен из-за транзиентных сбоев');
    const live = FakeRecognition.instances.at(-1);
    assert.equal(live.started, 1, 'микрофон в итоге поднялся');
    v.stop();
  } finally {
    mock.timers.reset();
  }
});

test('после MAX_OPEN_FAILURES сбоев — фатальная ошибка, голос выключается', () => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'] });
  let fatalCode = null;
  try {
    FakeRecognition.failNext = 99; // start() бросает всегда
    const v = new VoiceFollower({
      scriptBody: 'один два три',
      onError: (_msg, code) => {
        fatalCode = code;
      },
    });
    v.start();
    advance(3000); // достаточно, чтобы исчерпать все попытки переоткрытия
    assert.equal(fatalCode, 'open-failed', 'эскалация в фатальную ошибку');
    assert.equal(v.shouldRun, false, 'голосовой режим остановлен');
  } finally {
    mock.timers.reset();
  }
});

test('_handleEnd в фоне (suspended) не воскрешает микрофон', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    const v = new VoiceFollower({ scriptBody: 'а б в' });
    v.shouldRun = true;
    v._suspended = true;
    v._handleEnd();
    advance(1000);
    assert.equal(
      FakeRecognition.instances.length,
      0,
      'нет переоткрытия recognition в фоне',
    );
  } finally {
    mock.timers.reset();
  }
});

test('_handleEnd на мягкой паузе ВОСКРЕШАЕТ микрофон (горячий для «старт»)', () => {
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    const v = new VoiceFollower({ scriptBody: 'а б в' });
    v.shouldRun = true;
    v.followPaused = true;
    v._suspended = false;
    v._handleEnd(); // recognition сейчас null
    advance(1000);
    assert.equal(
      FakeRecognition.instances.length,
      1,
      'микрофон переоткрыт, чтобы слышать «старт старт»',
    );
    v.stop();
  } finally {
    mock.timers.reset();
  }
});

// 30 несвязанных по смыслу и словам предложений (180 слов) — годится и
// для forward, и для backward сценариев. Числовые токены вроде «тест56»/
// «тест6» тут не подходят: у них маленькое редакционное расстояние
// («тест56» → «тест6» это всего одно удаление символа), и fuzzy-сравнение
// wordsMatch() их случайно считает «похожими», ломая тест. Реальные слова
// с разными корнями этой проблемы не создают.
const LONG_PASSAGE = [
  'кошка спит на подоконнике весь день',
  'облака медленно плывут над городом сегодня',
  'бабушка испекла пирог с вишней утром',
  'поезд опаздывает уже на сорок минут',
  'дети играют в футбол во дворе',
  'директор подписал важные документы вчера вечером',
  'художник рисует портрет незнакомой девушки маслом',
  'механик чинит старый мотоцикл в гараже',
  'официант принёс горячий кофе с молоком',
  'фермер собирает урожай яблок каждую осень',
  'студенты готовятся к сложному экзамену ночью',
  'капитан командует кораблём посреди шторма',
  'библиотекарь расставляет книги по алфавиту снова',
  'плотник строит деревянный забор возле дома',
  'актриса репетирует новую роль третий час',
  'садовник поливает розы каждое прохладное утро',
  'журналист берёт интервью у известного политика',
  'повар готовит суп из свежих грибов',
  'учитель объясняет теорему у доски долго',
  'пловец тренируется в бассейне перед соревнованиями',
  'слесарь ремонтирует кран на кухне быстро',
  'астроном наблюдает за далёкими звёздами ночью',
  'парикмахер стрижёт клиента новыми острыми ножницами',
  'таксист везёт пассажира через весь город',
  'пекарь замешивает тесто для свежего хлеба',
  'врач осматривает пациента в тихом кабинете',
  'рыбак ловит рыбу на закате у озера',
  'портной шьёт костюм для важной свадьбы',
  'пилот сажает самолёт в густом тумане',
  'скрипач играет грустную мелодию на площади',
].join(' ');

function speak(rec, transcript) {
  rec.onresult({ results: [[{ transcript }]] });
}

test('широкий forward-поиск: перескакивает на текст на много слов вперёд', () => {
  const v = new VoiceFollower({ scriptBody: LONG_PASSAGE });
  try {
    v.start();
    v.setCursor(0);
    const rec = FakeRecognition.instances[0];

    // Слова 38-42 («портрет незнакомой девушки маслом механик») — на 42
    // слова дальше курсора: дальше старого LOOKAHEAD=30, но внутри
    // текущего LOOKAHEAD=50 (проверено отдельно: единственная позиция в
    // окне [0,50) с score>=0.6 — это позиция 42).
    speak(rec, 'портрет незнакомой девушки маслом механик');

    assert.equal(v.cursor, 42, 'курсор перескочил далеко вперёд');
  } finally {
    v.stop();
  }
});

test('широкий backward-поиск: перескакивает на текст на много слов назад', () => {
  const v = new VoiceFollower({ scriptBody: LONG_PASSAGE });
  try {
    v.start();
    v.setCursor(120);
    const rec = FakeRecognition.instances[0];

    // Слова 18-22 («поезд опаздывает уже на сорок») — в 98 словах позади
    // курсора, за пределами старого LOOKBACK=50. Текущий LOOKBACK=100
    // должен поймать (единственная позиция в окне [20,120) с score>=0.6).
    speak(rec, 'поезд опаздывает уже на сорок');

    assert.equal(v.cursor, 22, 'курсор перескочил далеко назад');
  } finally {
    v.stop();
  }
});

test('backward-поиск: при нескольких повторах фразы находит ближайшее к курсору', () => {
  // Фраза встречается в скрипте дважды (позиции 4 и 9) — на «ничьей»
  // должен побеждать ближайший к курсору вариант (preferNearEnd), а не
  // самый дальний в окне поиска. Проверено отдельно: во всём остальном
  // тексте эта фраза больше нигде не всплывает даже частично.
  const phrase = 'кошка спит на подоконнике тихо';
  const script = `${phrase} ${phrase} ${LONG_PASSAGE}`;
  const v = new VoiceFollower({ scriptBody: script });
  try {
    v.start();
    // Курсор сразу после второго повтора — оба вхождения (позиции 4 и 9)
    // лежат в backward-окне.
    v.setCursor(15);
    const rec = FakeRecognition.instances[0];

    speak(rec, phrase);

    assert.equal(v.cursor, 9, 'выбрано ближайшее к курсору вхождение, не самое дальнее');
  } finally {
    v.stop();
  }
});

// Минимум 3 разных совпавших слова, чтобы вообще сдвинуть курсор. Слова
// «бабушка испекла пирог» стоят на позициях 12-14 и в первых 50 словах
// встречаются только там — удобно проверять точное число слов для прыжка.
test('forward: одно слово НЕ двигает курсор (мало совпадений)', () => {
  const v = new VoiceFollower({ scriptBody: LONG_PASSAGE });
  try {
    v.start();
    v.setCursor(0);
    speak(FakeRecognition.instances[0], 'бабушка');
    assert.equal(v.cursor, 0, 'на одном слове курсор стоит на месте');
  } finally {
    v.stop();
  }
});

test('forward: два слова НЕ двигают курсор', () => {
  const v = new VoiceFollower({ scriptBody: LONG_PASSAGE });
  try {
    v.start();
    v.setCursor(0);
    speak(FakeRecognition.instances[0], 'бабушка испекла');
    assert.equal(v.cursor, 0, 'двух слов недостаточно для прыжка');
  } finally {
    v.stop();
  }
});

test('forward: три слова двигают курсор', () => {
  const v = new VoiceFollower({ scriptBody: LONG_PASSAGE });
  try {
    v.start();
    v.setCursor(0);
    speak(FakeRecognition.instances[0], 'бабушка испекла пирог');
    assert.equal(v.cursor, 14, 'три совпавших слова — прыжок разрешён');
  } finally {
    v.stop();
  }
});

test('backward: одно слово НЕ утаскивает курсор назад', () => {
  const v = new VoiceFollower({ scriptBody: LONG_PASSAGE });
  try {
    v.start();
    v.setCursor(30);
    speak(FakeRecognition.instances[0], 'бабушка');
    assert.equal(v.cursor, 30, 'на одном слове назад не прыгаем');
  } finally {
    v.stop();
  }
});

test('backward: три слова разрешают прыжок назад', () => {
  const v = new VoiceFollower({ scriptBody: LONG_PASSAGE });
  try {
    v.start();
    v.setCursor(30);
    speak(FakeRecognition.instances[0], 'бабушка испекла пирог');
    assert.equal(v.cursor, 14, 'три совпавших слова — прыжок назад разрешён');
  } finally {
    v.stop();
  }
});
