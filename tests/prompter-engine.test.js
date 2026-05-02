import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  speedToPxPerSec,
  computeScrollStep,
} from '../src/lib/prompter-engine.js';

test('speedToPxPerSec: монотонный рост', () => {
  assert.equal(speedToPxPerSec(1), 6.5);
  assert.equal(speedToPxPerSec(30), 50);
  assert.equal(speedToPxPerSec(100), 155);
  assert.ok(speedToPxPerSec(50) > speedToPxPerSec(20));
});

test('computeScrollStep: накапливает дробную часть', () => {
  let acc = 0;
  // pxPerSec = 50 при speed=30. dt=0.016 → 0.8 px за кадр.
  for (let i = 0; i < 5; i++) {
    const step = computeScrollStep(0.016, 30, acc);
    acc = step.accumulator;
    if (i < 1) {
      assert.equal(step.delta, 0, 'первый кадр пока 0 — копится дробная часть');
    }
  }
  // После 5 кадров (0.08 сек) должны были скроллнуть ~4 px суммарно
});

test('computeScrollStep: после 1 секунды на скорости 30 — около 50 px', () => {
  let acc = 0;
  let total = 0;
  for (let i = 0; i < 60; i++) {
    const step = computeScrollStep(1 / 60, 30, acc);
    total += step.delta;
    acc = step.accumulator;
  }
  // ровно 50 (с округлением вниз дробной части)
  assert.equal(total, 50);
});

test('computeScrollStep: на скорости 1 за секунду — около 6 px', () => {
  let acc = 0;
  let total = 0;
  for (let i = 0; i < 60; i++) {
    const step = computeScrollStep(1 / 60, 1, acc);
    total += step.delta;
    acc = step.accumulator;
  }
  assert.equal(total, 6);
});

test('computeScrollStep: фрейм-рейт независимость', () => {
  // 30 fps vs 60 fps — за ту же секунду скроллит одинаково
  let acc60 = 0;
  let total60 = 0;
  for (let i = 0; i < 60; i++) {
    const s = computeScrollStep(1 / 60, 50, acc60);
    total60 += s.delta;
    acc60 = s.accumulator;
  }

  let acc30 = 0;
  let total30 = 0;
  for (let i = 0; i < 30; i++) {
    const s = computeScrollStep(1 / 30, 50, acc30);
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
