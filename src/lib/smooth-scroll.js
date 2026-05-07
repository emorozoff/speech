// Непрерывный lerp-based scroller.
//
// Раньше каждый scrollTo() отменял предыдущий tween и запускал новый —
// при voice-следовании это давало дёрганость, потому что onPosition
// присылает новую позицию каждые ~100ms, а tween шёл 250ms. Каждое
// новое слово прерывало текущее движение и начинало новое.
//
// Теперь scrollTo() просто обновляет target. Внутренний анимационный
// цикл каждый кадр сдвигает scrollTop на min(diff * factor, MAX_STEP).
// Получается плавное «преследование» цели без резких прыжков.
//
// Зачем clamp: при большой distance (voice догнал на 5 слов вперёд)
// чистый lerp на первых кадрах двигал бы текст слишком быстро —
// глаз не успевает следить, выглядит как «прыжок». Clamp на 14 px/кадр
// (~840 px/sec) даёт постоянную предсказуемую скорость движения.
const LERP_FACTOR = 0.14;
const MAX_STEP_PX = 14;

export class SmoothScroller {
  constructor(viewport) {
    this.viewport = viewport;
    this.frame = 0;
    this.target = null;
    this._step = this._step.bind(this);
  }

  scrollTo(targetY, durationMs = 250) {
    const next = Math.max(0, targetY);
    // durationMs === 0 — пользователь явно просит мгновенный scroll
    // (resume, font-size change, manual offset). Тогда не lerp'им.
    if (durationMs === 0) {
      this.cancel();
      this.viewport.scrollTop = next;
      return;
    }
    this.target = next;
    if (!this.frame) {
      this.frame = requestAnimationFrame(this._step);
    }
  }

  _step() {
    if (this.target === null) {
      this.frame = 0;
      return;
    }
    const current = this.viewport.scrollTop;
    const diff = this.target - current;
    if (Math.abs(diff) < 0.5) {
      this.viewport.scrollTop = this.target;
      this.target = null;
      this.frame = 0;
      return;
    }
    let step = diff * LERP_FACTOR;
    if (step > MAX_STEP_PX) step = MAX_STEP_PX;
    else if (step < -MAX_STEP_PX) step = -MAX_STEP_PX;
    this.viewport.scrollTop = current + step;
    this.frame = requestAnimationFrame(this._step);
  }

  cancel() {
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
    this.target = null;
  }
}
