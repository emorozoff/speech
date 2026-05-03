export const FONTS = [
  {
    key: 'system',
    label: 'Системный',
    stack:
      '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", system-ui, "Segoe UI", Roboto, sans-serif',
  },
  {
    key: 'inter',
    label: 'Inter',
    stack:
      '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  },
  {
    key: 'manrope',
    label: 'Manrope',
    stack:
      '"Manrope", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  },
  {
    key: 'pt-serif',
    label: 'PT Serif',
    stack: '"PT Serif", Georgia, "Times New Roman", serif',
  },
  {
    key: 'onest',
    label: 'Onest',
    stack:
      '"Onest", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  },
];

export const FONT_STACKS = Object.fromEntries(
  FONTS.map((f) => [f.key, f.stack]),
);

export const DEFAULT_FONT_KEY = 'system';

export function getFontStack(key) {
  return FONT_STACKS[key] ?? FONT_STACKS[DEFAULT_FONT_KEY];
}
