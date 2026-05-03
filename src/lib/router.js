const routes = [];
let notFoundHandler = null;
let firstDispatch = true;

export function route(pattern, handler) {
  routes.push({ parts: pattern.split('/'), handler });
}

export function notFound(handler) {
  notFoundHandler = handler;
}

export function navigate(path, { replace = false } = {}) {
  const next = '#' + path;
  if (replace) {
    window.history.replaceState(null, '', next);
    dispatch();
  } else {
    window.location.hash = next.slice(1);
  }
}

export function start() {
  window.addEventListener('hashchange', dispatch);
  dispatch();
}

function dispatch() {
  const isFirst = firstDispatch;
  firstDispatch = false;
  const path = window.location.hash.slice(1) || '/';
  const pathParts = path.split('/');
  for (const { parts, handler } of routes) {
    const params = match(parts, pathParts);
    if (params) {
      runHandler(handler, params, isFirst);
      return;
    }
  }
  if (notFoundHandler) notFoundHandler({ path });
}

function runHandler(handler, params, isFirst) {
  // На первом dispatch нет «старого» состояния — view transition
  // мигнул бы пустым экраном. Пропускаем.
  if (isFirst || typeof document.startViewTransition !== 'function') {
    handler(params);
    return;
  }
  document.startViewTransition(() => Promise.resolve(handler(params)));
}

function match(patternParts, pathParts) {
  if (patternParts.length !== pathParts.length) return null;
  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    const p = patternParts[i];
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (p !== pathParts[i]) {
      return null;
    }
  }
  return params;
}
