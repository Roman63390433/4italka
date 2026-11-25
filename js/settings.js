// Настройки оформления: значения по умолчанию, допустимые варианты и сохранение.
export const STYLES = [
  { id: "calm", name: "Спокойный" },
  { id: "vintage", name: "Винтаж" },
  { id: "autumn", name: "Библиотека" },
];

// «style» — цвет страницы берётся из стиля приложения
export const PAGES = [
  { id: "style", name: "По стилю" },
  { id: "light", name: "Белый" },
  { id: "sepia", name: "Сепия" },
  { id: "grey", name: "Серый" },
  { id: "dark", name: "Тёмный" },
];

export const FONTS = [
  { id: "Literata", css: '"Literata", serif' },
  { id: "Old Standard", css: '"Old Standard TT", serif' },
  { id: "Alegreya", css: '"Alegreya", serif' },
  { id: "PT Serif", css: '"PT Serif", serif' },
  { id: "Lora", css: '"Lora", serif' },
  { id: "Golos", css: '"Golos Text", sans-serif' },
];

export const LINE_HEIGHTS = [1.4, 1.6, 1.85];
export const MARGINS = [14, 24, 36];
export const SIZE_MIN = 13, SIZE_MAX = 30;

// шрифт чтения по умолчанию у каждого стиля
const STYLE_FONT = { calm: "Literata", vintage: "Old Standard", autumn: "Alegreya" };

const DEFAULTS = { style: "calm", page: "style", font: "Literata", size: 18, lh: 1.6, margin: 24, dim: 0 };
const KEY = "chitalka.settings";

export function load() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* испорченные данные — берём умолчания */ }
  const s = { ...DEFAULTS, ...saved };
  // защита от кривых значений
  if (!STYLES.some(x => x.id === s.style)) s.style = DEFAULTS.style;
  if (!PAGES.some(x => x.id === s.page)) s.page = DEFAULTS.page;
  if (!FONTS.some(x => x.id === s.font)) s.font = DEFAULTS.font;
  s.size = Math.min(SIZE_MAX, Math.max(SIZE_MIN, Number(s.size) || DEFAULTS.size));
  if (!LINE_HEIGHTS.includes(s.lh)) s.lh = DEFAULTS.lh;
  if (!MARGINS.includes(s.margin)) s.margin = DEFAULTS.margin;
  s.dim = Math.min(0.7, Math.max(0, Number(s.dim) || 0));
  return s;
}

export function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

// при смене стиля шрифт чтения переключается на «родной» шрифт стиля
export function withStyle(s, style) { return { ...s, style, font: STYLE_FONT[style] || s.font }; }

export const fontCss = id => (FONTS.find(f => f.id === id) || FONTS[0]).css;
