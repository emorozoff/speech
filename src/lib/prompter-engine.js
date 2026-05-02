export function speedToPxPerSec(setting) {
  return setting * 1.5 + 5;
}

export function computeScrollStep(dtSeconds, speedSetting, accumulator) {
  const pxPerSec = speedToPxPerSec(speedSetting);
  const next = accumulator + pxPerSec * dtSeconds;
  const delta = Math.floor(next);
  return { delta, accumulator: next - delta };
}

export class ScrollEngine {
  constructor(viewport, speedSetting) {
    this.viewport = viewport;
    this.speedSetting = speedSetting;
    this.running = false;
    this.frame = 0;
    this.lastTime = 0;
    this.accumulator = 0;
    this.onEnd = null;
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
  }

  reset() {
    this.viewport.scrollTop = 0;
    this.accumulator = 0;
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

    if (this.isAtEnd()) {
      this.stop();
      if (this.onEnd) this.onEnd();
      return;
    }

    this.frame = requestAnimationFrame(this._step);
  }
}
