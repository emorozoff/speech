const HTML_ESCAPE = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => HTML_ESCAPE[c]);
}

const MONTHS_RU_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

export function formatRelative(timestamp, now = Date.now()) {
  const diff = now - timestamp;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;

  if (diff < 30_000) return 'только что';
  if (diff < hr) return `${Math.floor(diff / min)} мин`;
  if (diff < day) return `${Math.floor(diff / hr)} ч`;
  if (diff < 2 * day) return 'вчера';
  if (diff < 7 * day) return `${Math.floor(diff / day)} дн`;

  const d = new Date(timestamp);
  return `${d.getDate()} ${MONTHS_RU_SHORT[d.getMonth()]}`;
}

export function makePreview(body, maxChars = 90) {
  const cleaned = String(body).replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxChars) return cleaned;
  return cleaned.slice(0, maxChars).trimEnd() + '…';
}

export function wordCount(body) {
  if (!body) return 0;
  return String(body).trim().split(/\s+/).filter(Boolean).length;
}

const pluralRules = new Intl.PluralRules('ru-RU');

export function pluralize(n, forms) {
  const category = pluralRules.select(n);
  return forms[category] ?? forms.other;
}

export function wordsLabel(n) {
  return pluralize(n, { one: 'слово', few: 'слова', many: 'слов', other: 'слов' });
}
