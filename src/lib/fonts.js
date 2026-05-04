// Один шрифт для всего: системный SF Pro на iOS — без сетевых
// зависимостей, нативная iOS-эстетика, нулевой flash unstyled text.
// На других платформах fallback на system-ui / sans-serif.
const SYSTEM_STACK =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif';

export const FONTS = [
  { key: 'system', label: 'Системный', stack: SYSTEM_STACK },
];

export const DEFAULT_FONT_KEY = 'system';

export function getFontStack() {
  // Шрифт сейчас один — игнорируем key, что бы там ни лежало в
  // старых сохранённых настройках.
  return SYSTEM_STACK;
}
