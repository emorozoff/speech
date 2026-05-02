import { getScript } from '../storage/scripts.js';
import { navigate } from '../lib/router.js';
import { escapeHtml } from '../lib/format.js';

export async function renderEditor(root, { id }) {
  const script = await getScript(id);
  if (!script) {
    navigate('/', { replace: true });
    return;
  }

  const title = script.title?.trim() || 'без названия';

  root.innerHTML = `
    <section class="editor-stub">
      <header class="topbar">
        <button class="topbar__back" data-action="back" aria-label="назад">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none">
            <path d="M14.5 18 8 12l6.5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <h1 class="topbar__title">${escapeHtml(title)}</h1>
        <span class="topbar__spacer"></span>
      </header>
      <main class="editor-stub__body">
        <p class="editor-stub__hint">редактор появится в этапе 4</p>
      </main>
    </section>
  `;

  const section = root.firstElementChild;
  section.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="back"]')) navigate('/');
  });
}
