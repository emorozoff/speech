import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  speedToPxPerSec,
  computeScrollStep,
} from '../src/lib/prompter-engine.js';

test('speedToPxPerSec: линейный, шкала [1..20]', () => {
  assert.equal(speedToPxPerSec(1), 4);
  assert.equal(speedToPxPerSec(10), 40);
  assert.equal(speedToPxPerSec(20), 80);
  assert.ok(speedToPxPerSec(15) > speedToPxPerSec(5));
});

test('speedToPxPerSec: clamp за границами шкалы', () => {
  // Старые скрипты могут содержать speed=50/100 — движок их клампит,
  // а не разгоняется до 200 px/sec.
  assert.equal(speedToPxPerSec(50), 80);
  assert.equal(speedToPxPerSec(100), 80);
  assert.equal(speedToPxPerSec(0), 4);
  assert.equal(speedToPxPerSec(-5), 4);
});

test('computeScrollStep: накапливает дробную часть на низкой скорости', () => {
  let acc = 0;
  // pxPerSec = 20 при speed=5. dt=0.016 → 0.32 px за кадр —
  // первые кадры delta=0, копится дробная часть.
  for (let i = 0; i < 3; i++) {
    const step = computeScrollStep(0.016, 5, acc);
    acc = step.accumulator;
    assert.equal(step.delta, 0, `кадр ${i}: пока копим, delta=0`);
  }
});

test('computeScrollStep: за 1 секунду на скорости 10 → ~40 px', () => {
  let acc = 0;
  let total = 0;
  for (let i = 0; i < 60; i++) {
    const step = computeScrollStep(1 / 60, 10, acc);
    total += step.delta;
    acc = step.accumulator;
  }
  // ±1 — допустимая floating-point погрешность накопления за 60 кадров
  assert.ok(Math.abs(total - 40) <= 1, `total ${total} ≈ 40`);
});

test('computeScrollStep: на скорости 1 за секунду — ~4 px', () => {
  let acc = 0;
  let total = 0;
  for (let i = 0; i < 60; i++) {
    const step = computeScrollStep(1 / 60, 1, acc);
    total += step.delta;
    acc = step.accumulator;
  }
  assert.ok(Math.abs(total - 4) <= 1, `total ${total} ≈ 4`);
});

test('computeScrollStep: фрейм-рейт независимость', () => {
  // 30 fps vs 60 fps — за ту же секунду скроллит одинаково.
  let acc60 = 0;
  let total60 = 0;
  for (let i = 0; i < 60; i++) {
    const s = computeScrollStep(1 / 60, 15, acc60);
    total60 += s.delta;
    acc60 = s.accumulator;
  }

  let acc30 = 0;
  let total30 = 0;
  for (let i = 0; i < 30; i++) {
    const s = computeScrollStep(1 / 30, 15, acc30);
    total30 += s.delta;
    acc30 = s.accumulator;
  }

  assert.equal(total60, total30, 'разные fps — одинаковый итог за секунду');
});

test('computeScrollStep: dt=0 — нулевой шаг', () => {
  const step = computeScrollStep(0, 100, 0);
  assert.equal(step.delta, 0);
  assert.equal(step.accumulator, 0);
});
