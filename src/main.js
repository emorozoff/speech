import './styles/design-system.css';
import './styles/base.css';
import './styles/intro.css';

const root = document.getElementById('app');

root.innerHTML = `
  <main class="intro">
    <div class="intro__brand">
      <span class="intro__dot" aria-hidden="true"></span>
      <h1 class="intro__title">speech</h1>
    </div>
    <p class="intro__subtitle">телесуфлёр</p>
    <p class="intro__hint">
      этап 1 — фундамент готов. дальше: библиотека, редактор, суфлёр.
    </p>
  </main>
`;
