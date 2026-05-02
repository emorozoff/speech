import { test } from 'node:test';
import assert from 'node:assert/strict';

import { debounce } from '../src/lib/debounce.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('debounce: вызов один раз после серии', async () => {
  let calls = 0;
  let lastArg = null;
  const fn = debounce((x) => {
    calls += 1;
    lastArg = x;
  }, 30);

  fn(1);
  fn(2);
  fn(3);
  assert.equal(calls, 0, 'не вызывается мгновенно');

  await wait(50);
  assert.equal(calls, 1, 'вызывается один раз после паузы');
  assert.equal(lastArg, 3, 'с последним аргументом');
});

test('debounce: отдельные пачки', async () => {
  let calls = 0;
  const fn = debounce(() => {
    calls += 1;
  }, 20);

  fn();
  await wait(40);
  fn();
  await wait(40);
  assert.equal(calls, 2);
});

test('debounce.flush: вызывает немедленно и отменяет таймер', async () => {
  let calls = 0;
  let lastArg = null;
  const fn = debounce((x) => {
    calls += 1;
    lastArg = x;
  }, 100);

  fn('a');
  await fn.flush();
  assert.equal(calls, 1);
  assert.equal(lastArg, 'a');

  await wait(150);
  assert.equal(calls, 1, 'таймер отменён, повторного вызова нет');
});

test('debounce.flush: без отложенного вызова — no-op', async () => {
  let calls = 0;
  const fn = debounce(() => {
    calls += 1;
  }, 30);

  await fn.flush();
  assert.equal(calls, 0);
});

test('debounce.cancel: отменяет отложенный вызов', async () => {
  let calls = 0;
  const fn = debounce(() => {
    calls += 1;
  }, 30);

  fn();
  fn.cancel();
  await wait(50);
  assert.equal(calls, 0);
});
