export function debounce(fn, ms) {
  let timer = null;
  let lastArgs = null;

  const debounced = (...args) => {
    lastArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...lastArgs);
    }, ms);
  };

  debounced.flush = async () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    await fn(...lastArgs);
  };

  debounced.cancel = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
  };

  return debounced;
}
