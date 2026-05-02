import './styles/design-system.css';
import './styles/base.css';
import './styles/intro.css';

import * as scriptsApi from './storage/scripts.js';

if (import.meta.env.DEV) {
  window.__storage = scriptsApi;
}

const root = document.getElementById('app');

function renderShell({ count = null, error = null } = {}) {
  const status = error
    ? `<span class="intro__error">ошибка хранилища: ${error}</span>`
    : count === null
      ? 'этап 2 — хранилище готово.'
      : `этап 2 — хранилище готово. в базе скриптов: <strong>${count}</strong>.`;

  root.innerHTML = `
    <main class="intro">
      <div class="intro__brand">
        <span class="intro__dot" aria-hidden="true"></span>
        <h1 class="intro__title">speech</h1>
      </div>
      <p class="intro__subtitle">телесуфлёр</p>
      <p class="intro__hint">${status}</p>
    </main>
  `;
}

renderShell();

scriptsApi
  .listScripts()
  .then((list) => renderShell({ count: list.length }))
  .catch((err) => renderShell({ error: err.message ?? String(err) }));
