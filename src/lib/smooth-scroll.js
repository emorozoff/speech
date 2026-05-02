export class SmoothScroller {
  constructor(viewport) {
    this.viewport = viewport;
    this.frame = 0;
  }

  scrollTo(targetY, durationMs = 250) {
    this.cancel();
    const startY = this.viewport.scrollTop;
    const target = Math.max(0, targetY);
    const distance = target - startY;
    if (Math.abs(distance) < 1) {
      this.viewport.scrollTop = target;
      return;
    }
    const startTime = performance.now();

    const step = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      this.viewport.scrollTop = startY + distance * eased;
      if (t < 1) {
        this.frame = requestAnimationFrame(step);
      } else {
        this.frame = 0;
      }
    };
    this.frame = requestAnimationFrame(step);
  }

  cancel() {
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
    }
  }
}
