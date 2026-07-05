import { createRecognition } from './recognition.js';
import { tokenize, findBestPositionInRange } from './voice-matching.js';
import { detectCommand } from './voice-commands.js';

const BUFFER_SIZE = 5;
// 100/150 оказалось слишком широко — суфлёр иногда резко прыгал далеко
// вперёд/назад на случайно похожий кусок текста вместо соседних строк.
// 50/100 — компромисс: заметно шире исходных 30/50 (можно поймать переход
// через несколько строк), но без скачков через полтекста.
const LOOKAHEAD = 50;
const LOOKBACK = 100;
// Минимум РАЗНЫХ совпавших слов, чтобы вообще сдвинуть курсор — и вперёд,
// и назад. Одного-двух совпавших слов (тем более коротких «и»/«на»)
// недостаточно: именно на них суфлёр раньше срывался далеко не туда.
// Требуем три осмысленных слова подряд — тогда прыжок точно оправдан.
const MIN_MATCH_WORDS = 3;
// Прыжок назад — более рискованный (легко улететь в начало на повторах),
// поэтому вдобавок к MIN_MATCH_WORDS держим высокий порог по score.
const BACKWARD_THRESHOLD = 0.7;
const RESTART_DELAY_MS = 250;
const COMMAND_COOLDOWN_MS = 2000;
// start() на iOS бросает InvalidStateError, если прошлый recognition ещё
// не отпустил движок. Это транзиентно — несколько раз переоткрываем, и
// только потом считаем отказ фатальным, чтобы не гасить голосовой режим.
const MAX_OPEN_FAILURES = 5;
// iOS Safari иногда «тихо» закрывает recognition: onend не приходит,
// но и результатов больше нет. Если за это время ни одного onresult
// не пришло — форсируем рестарт.
const HEARTBEAT_INTERVAL_MS = 1000;
const HEARTBEAT_TIMEOUT_MS = 5000;

export class VoiceFollower {
  constructor({ scriptBody, onPosition, onCommand, onStateChange, onError }) {
    this.scriptTokens = tokenize(scriptBody);
    this.onPosition = onPosition || (() => {});
    this.onCommand = onCommand || (() => {});
    this.onStateChange = onStateChange || (() => {});
    this.onError = onError || (() => {});

    this.recognition = null;
    this.shouldRun = false;
    // followPaused — мягкая пауза: курсор не двигаем, но микрофон держим
    // горячим, чтобы услышать «старт старт» и другие команды.
    this.followPaused = false;
    // suspended — жёсткая остановка (уход в фон): микрофон отпущен,
    // авто-рестарт запрещён, пока не вернёмся по жесту пользователя.
    this._suspended = false;
    this.cursor = 0;
    this.recentWords = [];
    this._lastCommandLabel = '';
    this._lastCommandTime = 0;
    this._lastResultTime = 0;
    this._heartbeatTimer = null;
    this._openFailures = 0;

    this._handleResult = this._handleResult.bind(this);
    this._handleEnd = this._handleEnd.bind(this);
    this._handleError = this._handleError.bind(this);
    this._heartbeatTick = this._heartbeatTick.bind(this);
  }

  start() {
    if (this.shouldRun) return;
    this.shouldRun = true;
    this.followPaused = false;
    this._suspended = false;
    this._openFailures = 0;
    this._open();
    this._startHeartbeat();
  }

  stop() {
    this.shouldRun = false;
    this.followPaused = false;
    this._suspended = false;
    this._stopHeartbeat();
    this._close();
    this.onStateChange('stopped');
  }

  // Мягкая пауза (тап «стоп» или голосовая «стоп стоп»): перестаём двигать
  // курсор, но микрофон оставляем горячим — чтобы поймать «старт старт».
  pause() {
    if (this.followPaused) return;
    this.followPaused = true;
    this.onStateChange('paused');
  }

  resume() {
    this.followPaused = false;
    this._suspended = false;
    if (!this.shouldRun || this.recognition) return;
    // Микрофон закрыт (умер во время паузы или был отпущен в фоне) —
    // поднимаем заново. resume() вызывается из жеста пользователя (тап
    // Play) или из голосовой команды на горячем микрофоне, поэтому iOS
    // разрешает старт распознавания.
    this._openFailures = 0;
    this._open();
    this._startHeartbeat();
  }

  // Жёсткая остановка для ухода в фон: отпускаем микрофон немедленно и
  // запрещаем авто-рестарт. Иначе на iOS индикатор записи горит ещё долго
  // после сворачивания, а recognition пытается «воскреснуть» в фоне.
  suspend() {
    if (this._suspended) return;
    this._suspended = true;
    this._stopHeartbeat();
    this._close();
    this.onStateChange('suspended');
  }

  setCursor(idx) {
    this.cursor = Math.max(
      0,
      Math.min(idx | 0, Math.max(0, this.scriptTokens.length - 1)),
    );
  }

  _open() {
    if (this.recognition) return;
    try {
      const rec = createRecognition({ lang: 'ru-RU' });
      rec.onresult = this._handleResult;
      rec.onend = this._handleEnd;
      rec.onerror = this._handleError;
      this.recognition = rec;
      rec.start();
      this._lastResultTime = Date.now();
      this._openFailures = 0;
      this.onStateChange('listening');
    } catch (err) {
      // start() кинул до того, как recognition «ожил» — снимаем ссылку,
      // иначе guard в начале _open()/_scheduleRestart заблокирует переоткрытие.
      this.recognition = null;
      this._openFailures++;
      if (this._openFailures >= MAX_OPEN_FAILURES) {
        this.shouldRun = false;
        this._stopHeartbeat();
        this.onError(err.message ?? String(err), 'open-failed');
      } else {
        this._scheduleRestart();
      }
    }
  }

  _close() {
    if (!this.recognition) return;
    const rec = this.recognition;
    // Снимаем ссылку сразу, чтобы повторный _close()/onend не дёргали
    // уже закрываемый объект.
    this.recognition = null;
    rec.onresult = null;
    rec.onend = null;
    rec.onerror = null;
    try {
      // abort() отпускает микрофон немедленно; stop() может ещё подержать
      // его, «дослушивая» хвост, — на iOS из-за этого индикатор записи
      // горит долго после паузы/сворачивания.
      if (typeof rec.abort === 'function') rec.abort();
      else rec.stop();
    } catch {
      /* ignore */
    }
  }

  _handleResult(event) {
    this._lastResultTime = Date.now();
    const last = event.results[event.results.length - 1];
    if (!last) return;
    const transcript = last[0]?.transcript ?? '';
    const words = tokenize(transcript);
    if (words.length === 0) return;

    const cmd = detectCommand(words);
    if (cmd) {
      const now = Date.now();
      if (
        cmd.label !== this._lastCommandLabel ||
        now - this._lastCommandTime > COMMAND_COOLDOWN_MS
      ) {
        this._lastCommandLabel = cmd.label;
        this._lastCommandTime = now;
        this.onCommand(cmd);
      }
      words.splice(cmd.consumedFrom, cmd.consumedTo - cmd.consumedFrom);
    }

    if (this.followPaused || words.length === 0) return;

    this.recentWords = words.slice(-BUFFER_SIZE);

    // Forward имеет приоритет: если впереди есть нормальный матч —
    // продолжаем как обычно. Это покрывает 99% сценариев и защищает
    // от ложных прыжков назад при импровизации. Но двигаемся только когда
    // совпали хотя бы MIN_MATCH_WORDS разных слов — иначе на одном-двух
    // словах суфлёр «убегал» вперёд к случайно похожему куску.
    const forward = findBestPositionInRange(
      this.scriptTokens,
      this.recentWords,
      this.cursor,
      this.cursor + LOOKAHEAD,
    );

    if (forward.unique >= MIN_MATCH_WORDS) {
      this.cursor = forward.pos;
      this.onPosition(forward.pos, forward.score);
      return;
    }

    // Forward провалился — пробуем уйти назад. Высокий порог + минимум
    // уникальных слов отсекают повторы коротких слов и совпадения по
    // одному «и» / «но» / «это».
    if (this.cursor === 0) return;
    const backward = findBestPositionInRange(
      this.scriptTokens,
      this.recentWords,
      Math.max(0, this.cursor - LOOKBACK),
      this.cursor,
      // При нескольких позициях с одинаковым счётом предпочитаем ту, что
      // ближе к курсору (концу диапазона) — иначе с широким LOOKBACK
      // «ничья» по умолчанию уводила бы в самую дальнюю точку диапазона.
      { preferNearEnd: true },
    );
    if (
      backward.score >= BACKWARD_THRESHOLD &&
      backward.unique >= MIN_MATCH_WORDS
    ) {
      this.cursor = backward.pos;
      this.onPosition(backward.pos, backward.score);
    }
  }

  _handleEnd() {
    this.recognition = null;
    // В фоне (suspended) и после stop() не воскрешаем микрофон — иначе он
    // будет оживать в свёрнутом приложении и держать индикатор записи.
    // На мягкой паузе, наоборот, держим горячим, чтобы услышать «старт».
    if (this.shouldRun && !this._suspended) {
      this.onStateChange('reconnecting');
      this._scheduleRestart();
    }
  }

  _handleError(event) {
    const code = event.error;
    if (code === 'not-allowed' || code === 'service-not-allowed') {
      this.shouldRun = false;
      this._stopHeartbeat();
      this.onError('Доступ к микрофону не дан', 'permission-denied');
      return;
    }
    if (code === 'aborted') {
      return;
    }
    /* 'no-speech', 'network', etc. — let onend trigger restart */
  }

  _scheduleRestart() {
    setTimeout(() => {
      if (this.shouldRun && !this._suspended && !this.recognition) {
        this._open();
      }
    }, RESTART_DELAY_MS);
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this._lastResultTime = Date.now();
    this._heartbeatTimer = setInterval(
      this._heartbeatTick,
      HEARTBEAT_INTERVAL_MS,
    );
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
  }

  _heartbeatTick() {
    if (!this.shouldRun || this._suspended) return;
    // На мягкой паузе пользователь молчит специально — не считаем это
    // «застряло». Двигаем точку отсчёта, чтобы не дёргать recognition зря,
    // но микрофон оставляем живым (его поддерживает _handleEnd).
    if (this.followPaused) {
      this._lastResultTime = Date.now();
      return;
    }
    const elapsed = Date.now() - this._lastResultTime;
    if (elapsed < HEARTBEAT_TIMEOUT_MS) return;
    // Recognition «застрял» — ни onresult, ни onend больше HEARTBEAT_TIMEOUT_MS.
    // Сбрасываем таймер и форсируем рестарт.
    this._lastResultTime = Date.now();
    this.onStateChange('reconnecting');
    this._close();
    this._scheduleRestart();
  }
}
