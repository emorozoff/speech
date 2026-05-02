const routes = [];
let notFoundHandler = null;

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
  const path = window.location.hash.slice(1) || '/';
  const pathParts = path.split('/');
  for (const { parts, handler } of routes) {
    const params = match(parts, pathParts);
    if (params) {
      handler(params);
      return;
    }
  }
  if (notFoundHandler) notFoundHandler({ path });
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
