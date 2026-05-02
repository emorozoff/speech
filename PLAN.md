# PLAN — План разработки

Каждый этап = отдельный коммит. После каждого этапа отчёт с тем, что готово и что можно проверить.

## Этап 1: Фундамент
**Коммит:** `chore: scaffold project + design system`

- Структура проекта (Vite + Vanilla JS)
- `package.json`, `vite.config.js`, `.gitignore`
- `index.html` с PWA meta-tags для iOS
- Дизайн-система (CSS-переменные: цвета, типографика, отступы)
- Базовый CSS-reset
- Стартовая заглушка-страница (демонстрирует дизайн-систему)
- `SPEC.md`, `PLAN.md`, `README.md`

## Этап 2: Хранилище
**Коммит:** `feat: storage layer (IndexedDB)`

- Обёртка над IndexedDB
- API: `listScripts()`, `getScript(id)`, `createScript()`, `updateScript()`, `deleteScript()`, `duplicateScript()`
- Модель скрипта: `{ id, title, body, settings, createdAt, updatedAt }`

## Этап 3: Экран Библиотеки
**Коммит:** `feat: library screen`

- Список скриптов (карточки)
- Кнопка «+ Новый скрипт»
- Удаление (с подтверждением), дублирование
- Если пусто — empty state

## Этап 4: Экран Редактора
**Коммит:** `feat: editor screen`

- Поле названия
- Текстовое поле для содержания
- Панель настроек: размер шрифта, скорость, межстрочный, зеркала, маркер, голос
- Кнопки: «Сохранить», «Назад», «Старт» (переход в суфлёр)
- Авто-сохранение при изменениях

## Этап 5: Ядро суфлёра
**Коммит:** `feat: prompter core (fullscreen + auto-scroll)`

- Fullscreen API
- Landscape lock через Screen Orientation API
- Wake Lock API (экран не уснёт)
- Движок авто-прокрутки на `requestAnimationFrame`
- Регулировка скорости в реальном времени
- Кнопки: Play/Pause, Restart, Exit, Speed +/−

## Этап 6: Ручное управление
**Коммит:** `feat: touch controls`

- Свайпы для ручной прокрутки (отдельно от авто)
- Тап-зоны: левая половина — медленнее, правая — быстрее
- Двойной тап — пауза/возобновление
- Долгий тап — показать контролы

## Этап 7: Зеркало + маркер
**Коммит:** `feat: mirror modes & reading line`

- CSS-трансформации: `scaleX(-1)` для горизонтального flip, `scaleY(-1)` для вертикального
- Тоггл в настройках и быстрое переключение в режиме чтения
- Маркер-линия посередине экрана (1px высотой, цвет `--color-accent`)
- Тоггл маркера

## Этап 8: Голосовое следование
**Коммит:** `feat: voice following (Web Speech API)`

- Wrapper над `webkitSpeechRecognition` для ru-RU
- Автоперезапуск сессии при разрыве (~60 сек тишины)
- Fuzzy matching последних распознанных слов с окном текста
- Плавная прокрутка к найденной позиции
- Тоггл в настройках, индикатор активности микрофона

## Этап 9: PWA
**Коммит:** `feat: pwa support (manifest + service worker)`

- `manifest.webmanifest`: имя, иконки, theme color, ориентация
- Иконки: 192px, 512px, маска iOS
- Service Worker через Workbox или вручную: precache всего билда
- Регистрация SW в `main.js`
- Поддержка установки на главный экран iOS

## Этап 10: Деплой
**Коммит:** `chore: deploy pipeline (GitHub Pages)`

- Vite `base: '/speech/'`
- GitHub Actions workflow: build → deploy to `gh-pages` branch
- Включить GitHub Pages в настройках репозитория
- Проверка на реальном iPhone 13 (если возможно)
- Финальный README с инструкцией установки на телефон

## После плана
- Доработки и фиксы по результатам тестирования на реальном устройстве
