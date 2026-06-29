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
