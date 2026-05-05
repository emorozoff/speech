import { listScripts, createScript } from './scripts.js';

const SEED_KEY = 'speech.demoSeeded';

const DEMO_TITLE = 'Почему это самый крутой телесуфлёр';

const DEMO_BODY = `Главная фишка — суфлёр сам подстраивается под вас. Включаете микрофон, читаете как обычно — и текст идёт за вашим голосом. Запнулись — ждёт. Заторопились — догоняет.

Этот суфлёр полностью бесплатный. Никаких подписок и скрытых платежей. Я не возьму с вас денег ни сейчас, ни через пять лет. И сюда никогда не попадёт реклама. Серьёзно — никогда.

Создавайте свой первый скрипт через плюс справа сверху.`;

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
