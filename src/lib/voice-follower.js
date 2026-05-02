import { createRecognition } from './recognition.js';
import { tokenize, findBestPosition } from './voice-matching.js';

const BUFFER_SIZE = 5;
const LOOKAHEAD = 30;
const MATCH_THRESHOLD = 0.4;
const RESTART_DELAY_MS = 250;

export class VoiceFollower {
  constructor({ scriptBody, onPosition, onStateChange, onError }) {
    this.scriptTokens = tokenize(scriptBody);
    this.onPosition = onPosition || (() => {});
    this.onStateChange = onStateChange || (() => {});
    this.onError = onError || (() => {});

    this.recognition = null;
    this.shouldRun = false;
    this.cursor = 0;
    this.recentWords = [];

    this._handleResult = this._handleResult.bind(this);
    this._handleEnd = this._handleEnd.bind(this);
    this._handleError = this._handleError.bind(this);
  }

  start() {
    if (this.shouldRun) return;
    this.shouldRun = true;
    this._open();
  }

  stop() {
    this.shouldRun = false;
    this._close();
    this.onStateChange('stopped');
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
      this.onStateChange('listening');
    } catch (err) {
      this.onError(err.message ?? String(err));
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
    const last = event.results[event.results.length - 1];
    if (!last) return;
    const transcript = last[0]?.transcript ?? '';
    const words = tokenize(transcript);
    if (words.length === 0) return;

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
      this.onError('Доступ к микрофону не дан');
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
}
