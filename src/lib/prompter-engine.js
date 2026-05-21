// Шкала [1..20]. Линейный коэф 2 px/sec на шаг даёт диапазон [2..40] px/sec.
// Раньше было × 4, но пользователи жаловались что комфортный темп
// получался на slider'е 5-6 (20-24 px/sec), а default 12 был сильно
// быстрее. Переразметили так, чтобы комфорт оказался в районе 10.
export function speedToPxPerSec(setting) {
  const clamped = Math.min(20, Math.max(1, Number(setting) || 1));
  return clamped * 2;
}

export function computeScrollStep(dtSeconds, speedSetting, accumulator) {
  const pxPerSec = speedToPxPerSec(speedSetting);
  const next = accumulator + pxPerSec * dtSeconds;
  const delta = Math.floor(next);
  return { delta, accumulator: next - delta };
}

export class ScrollEngine {
  constructor(viewport, speedSetting, options = {}) {
    this.viewport = viewport;
    this.speedSetting = speedSetting;
    this.running = false;
    this.frame = 0;
    this.lastTime = 0;
    this.accumulator = 0;
    this.onEnd = null;
    // onFrame(subPixel) даёт потребителю дробную часть пикселя для
    // sub-pixel смещения через CSS-transform — иначе на скорости 1
    // целочисленный scrollTop виден как редкие рывки по 1px.
    this.onFrame = options.onFrame ?? null;
    this._step = this._step.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.frame = requestAnimationFrame(this._step);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.accumulator = 0;
    if (this.onFrame) this.onFrame(0);
  }

  reset() {
    this.viewport.scrollTop = 0;
    this.accumulator = 0;
    if (this.onFrame) this.onFrame(0);
  }

  setSpeed(setting) {
    this.speedSetting = setting;
  }

  isAtEnd() {
    const v = this.viewport;
    return v.scrollTop + v.clientHeight >= v.scrollHeight - 1;
  }

  _step(now) {
    if (!this.running) return;
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    const { delta, accumulator } = computeScrollStep(
      dt,
      this.speedSetting,
      this.accumulator,
    );
    this.accumulator = accumulator;
    if (delta > 0) {
      this.viewport.scrollTop += delta;
    }
    if (this.onFrame) this.onFrame(accumulator);

    if (this.isAtEnd()) {
      this.stop();
      if (this.onEnd) this.onEnd();
      return;
    }

    this.frame = requestAnimationFrame(this._step);
  }
}
