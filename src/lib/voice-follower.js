import { createRecognition } from './recognition.js';
import { tokenize, findBestPosition } from './voice-matching.js';
import { detectCommand } from './voice-commands.js';

const BUFFER_SIZE = 5;
const LOOKAHEAD = 30;
const MATCH_THRESHOLD = 0.4;
const RESTART_DELAY_MS = 250;
const COMMAND_COOLDOWN_MS = 2000;
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
    this.followPaused = false;
    this.cursor = 0;
    this.recentWords = [];
    this._lastCommandLabel = '';
    this._lastCommandTime = 0;
    this._lastResultTime = 0;
    this._heartbeatTimer = null;

    this._handleResult = this._handleResult.bind(this);
    this._handleEnd = this._handleEnd.bind(this);
    this._handleError = this._handleError.bind(this);
    this._heartbeatTick = this._heartbeatTick.bind(this);
  }

  start() {
    if (this.shouldRun) return;
    this.shouldRun = true;
    this._open();
    this._startHeartbeat();
  }

  stop() {
    this.shouldRun = false;
    this._stopHeartbeat();
    this._close();
    this.onStateChange('stopped');
  }

  pause() {
    this.followPaused = true;
  }

  resume() {
    this.followPaused = false;
  }

  setCursor(idx) {
    this.cursor = Math.max(
      0,
      Math.min(idx | 0, Math.max(0, this.scriptTokens.length - 1)),
    );
  }

  _open() {
    try {
      const rec = createRecognition({ lang: 'ru-RU' });
      rec.onresult = this._handleResult;
      rec.onend = this._handleEnd;
      rec.onerror = this._handleError;
      this.recognition = rec;
      rec.start();
      this._lastResultTime = Date.now();
      this.onStateChange('listening');
    } catch (err) {
      this.onError(err.message ?? String(err), 'open-failed');
      this._scheduleRestart();
    }
  }

  _close() {
    if (!this.recognition) return;
    try {
      this.recognition.onresult = null;
      this.recognition.onend = null;
      this.recognition.onerror = null;
      this.recognition.stop();
    } catch {
      /* ignore */
    }
    this.recognition = null;
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

    const { pos, score } = findBestPosition(
      this.scriptTokens,
      this.recentWords,
      this.cursor,
      LOOKAHEAD,
    );

    if (score >= MATCH_THRESHOLD && pos >= this.cursor) {
      this.cursor = pos;
      this.onPosition(pos, score);
    }
  }

  _handleEnd() {
    this.recognition = null;
    if (this.shouldRun) {
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
      if (this.shouldRun) this._open();
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
    if (!this.shouldRun) return;
    // На паузе пользователь молчит специально — не считаем это «застряло».
    // Сбрасываем таймер, чтобы не дёргать recognition зря.
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
