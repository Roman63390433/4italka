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

// размер, интервал и поля — плавные ползунки: [меньше, больше, шаг]
export const SIZE = [13, 30, 1];
export const LH = [1.2, 2.1, 0.05];
export const MARGIN = [8, 48, 2];
export const ALIGNS = [{ id: "justify", name: "По ширине" }, { id: "left", name: "По краю" }];
export const MODES = [{ id: "pages", name: "Страницы" }, { id: "scroll", name: "Лента" }];

// эти настройки можно задать отдельно для одной книги
export const BOOK_KEYS = ["font", "size", "lh", "margin", "align"];

// шрифт чтения по умолчанию у каждого стиля
const STYLE_FONT = { calm: "Literata", vintage: "Old Standard", autumn: "Alegreya" };

const DEFAULTS = { style: "calm", page: "style", font: "Literata", size: 18, lh: 1.6, margin: 24, align: "justify",
  mode: "pages", dim: 0, fullscreen: true };
const KEY = "chitalka.settings";

export function load() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* испорченные данные — берём умолчания */ }
  return clean({ ...DEFAULTS, ...saved });
}

const clamp = (v, [lo, hi], def) => Math.min(hi, Math.max(lo, Number(v) || def));

// защита от кривых значений (испорченный localStorage, старые версии)
function clean(s) {
  if (!STYLES.some(x => x.id === s.style)) s.style = DEFAULTS.style;
  if (!PAGES.some(x => x.id === s.page)) s.page = DEFAULTS.page;
  if (!FONTS.some(x => x.id === s.font)) s.font = DEFAULTS.font;
  if (!ALIGNS.some(x => x.id === s.align)) s.align = DEFAULTS.align;
  if (!MODES.some(x => x.id === s.mode)) s.mode = DEFAULTS.mode;
  s.size = clamp(s.size, SIZE, DEFAULTS.size);
  s.lh = Math.round(clamp(s.lh, LH, DEFAULTS.lh) * 100) / 100;
  s.margin = clamp(s.margin, MARGIN, DEFAULTS.margin);
  s.dim = Math.min(0.7, Math.max(0, Number(s.dim) || 0));
  s.fullscreen = s.fullscreen !== false;
  return s;
}

// ---- настройки одной книги: хранятся только отличия, ключ chitalka.look.<id> ----
const bookKey = id => "chitalka.look." + id;

export function loadBook(id) {
  try {
    const o = JSON.parse(localStorage.getItem(bookKey(id)));
    if (!o) return null;
    const picked = {};
    for (const k of BOOK_KEYS) if (k in o) picked[k] = o[k];
    return picked;
  } catch { return null; }
}

export function saveBook(id, o) {
  if (o) localStorage.setItem(bookKey(id), JSON.stringify(o));
  else localStorage.removeItem(bookKey(id));
}

// что действует сейчас: общие настройки, поверх — настройки книги
export const effective = (s, o) => clean({ ...s, ...(o || {}) });

export function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

// при смене стиля шрифт чтения переключается на «родной» шрифт стиля
export function withStyle(s, style) { return { ...s, style, font: STYLE_FONT[style] || s.font }; }

export const fontCss = id => (FONTS.find(f => f.id === id) || FONTS[0]).css;
