import { listScripts, createScript } from './scripts.js';

const SEED_KEY = 'speech.demoSeeded';

const DEMO_TITLE = 'попробовать суфлёр';

const DEMO_BODY = `привет!

это демо-скрипт — можешь удалить его, когда наиграешься.

тапни круглую кнопку снизу — и текст поедет сам. боковые стрелки меняют скорость на ходу. шестерёнка слева сверху открывает настройки: шрифт, ширина, положение линии чтения, зеркало.

если разрешишь микрофон, текст будет следовать за твоим голосом. читай вслух — слова подсветятся по очереди.

голосовые команды:
суфлёр стоп — поставить паузу.
суфлёр старт — продолжить.
быстрее или медленнее — поменять скорость.
сначала — вернуться к началу.

в портретной ориентации удобно для коротких выступлений, в горизонтальной — для долгих. поставь телефон в стекло суфлёра перед камерой и читай отражение — для этого включи зеркало в настройках.

готов? нажми крестик слева, чтобы выйти, и создай свой скрипт через плюс в правом верхнем углу. удачи в эфире.`;

export async function seedDemoScriptIfFirstRun() {
  try {
    if (localStorage.getItem(SEED_KEY) !== null) return null;
    const existing = await listScripts();
    if (existing.length > 0) {
      // Уже есть скрипты — это не первый запуск (например, миграция
      // старого пользователя). Помечаем seeded и не создаём демо.
      localStorage.setItem(SEED_KEY, '1');
      return null;
    }
    const created = await createScript({
      title: DEMO_TITLE,
      body: DEMO_BODY,
    });
    localStorage.setItem(SEED_KEY, '1');
    return created;
  } catch {
    /* localStorage может быть недоступен (private mode) — silently skip */
    return null;
  }
}
