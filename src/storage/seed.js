import { listScripts, createScript } from './scripts.js';

const SEED_KEY = 'speech.demoSeeded';

const DEMO_TITLE = 'Почему это самый крутой телесуфлёр';

const DEMO_BODY = `Главная фишка — суфлёр сам подстраивается под вас. Включаете микрофон, читаете как обычно — и текст идёт за вашим голосом. Больше не нужно подстраиваться под скорость телесуфлёра.

А ещё: этот суфлёр полностью бесплатный. Никаких подписок или рекламы. Но вы можете оставить отзыв в App Store — тем самым поможете продвинуть приложение.

Удачного блогинга!`;

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
