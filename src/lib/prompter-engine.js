// Шкала [1..20]. Линейный коэф 4 px/sec на шаг даёт диапазон [4..80] px/sec.
// Clamp защищает движок от мусорных значений в storage (например, миграция
// со старой шкалы [1..100]: значение 30 стало бы избыточно быстрым).
export function speedToPxPerSec(setting) {
  const clamped = Math.min(20, Math.max(1, Number(setting) || 1));
  return clamped * 4;
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
    // getVelocity() — внешний источник скорости в px/sec. Используется
    // в voice-режиме: speed подкручивается через обратную связь
    // (где voice-курсор vs где reading line). Если возвращает null,
    // engine падает обратно на статичное значение из speedSetting.
    this.getVelocity = options.getVelocity ?? null;
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

    let pxPerSec;
    if (this.getVelocity) {
      const v = this.getVelocity();
      pxPerSec =
        v !== null && v !== undefined ? v : speedToPxPerSec(this.speedSetting);
    } else {
      pxPerSec = speedToPxPerSec(this.speedSetting);
    }
    // Накапливаем дробную часть в this.accumulator и шагаем целыми
    // пикселями — sub-pixel остаток отдаём в onFrame для применения
    // через CSS-transform.
    const next = this.accumulator + Math.max(0, pxPerSec) * dt;
    const delta = Math.floor(next);
    this.accumulator = next - delta;
    if (delta > 0) {
      this.viewport.scrollTop += delta;
    }
    if (this.onFrame) this.onFrame(this.accumulator);

    if (this.isAtEnd()) {
      this.stop();
      if (this.onEnd) this.onEnd();
      return;
    }

    this.frame = requestAnimationFrame(this._step);
  }
}
