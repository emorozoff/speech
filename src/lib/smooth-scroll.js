// Непрерывный lerp-based scroller.
//
// Раньше каждый scrollTo() отменял предыдущий tween и запускал новый —
// при voice-следовании это давало дёрганость, потому что onPosition
// присылает новую позицию каждые ~100ms, а tween шёл 250ms. Каждое
// новое слово прерывало текущее движение и начинало новое.
//
// Теперь scrollTo() просто обновляет target. Внутренний анимационный
// цикл каждый кадр сдвигает scrollTop на (target - current) * factor.
// Получается плавное «преследование» цели без резких прыжков.
const LERP_FACTOR = 0.14;

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
    this.viewport.scrollTop = current + diff * LERP_FACTOR;
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
