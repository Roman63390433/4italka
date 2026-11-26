// Серии: группировка книг по серии, «прочитано 3 из 7», какая следующая, какие номера пропущены.
// Только правила, без кнопок. Сколько всего книг в серии, приложение знает только по своей полке,
// поэтому «всего» можно задать вручную — хранится в localStorage chitalka.series: { "название": { total } }.
import { statusOf } from "./status.js";

const KEY = "chitalka.series";
export const seriesKey = name => (name || "").replace(/\s+/g, " ").trim().toLowerCase();

export function loadTotals() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

export function saveTotal(name, total) {
  const all = loadTotals();
  const k = seriesKey(name);
  if (total > 0) all[k] = { total: Math.round(total) };
  else delete all[k];
  localStorage.setItem(KEY, JSON.stringify(all));
}

// books — книги полки с полем percent. Возвращает серии по алфавиту:
// { name, key, books (по номеру), total, manualTotal, done, next: { no, book|null }|null, missing: [номера], cont: книга|null }
export function groupSeries(books, totals = loadTotals()) {
  const map = new Map();
  for (const b of books) {
    if (!b.series?.trim()) continue;
    const k = seriesKey(b.series);
    if (!map.has(k)) map.set(k, { name: b.series.trim(), key: k, books: [] });
    map.get(k).books.push(b);
  }
  const list = [];
  for (const g of map.values()) {
    g.books.sort((a, b) => (a.seriesNo ?? 1e9) - (b.seriesNo ?? 1e9) || a.title.localeCompare(b.title, "ru"));
    const nos = g.books.map(b => b.seriesNo).filter(n => Number.isFinite(n) && n > 0);
    const maxNo = nos.length ? Math.floor(Math.max(...nos)) : 0;
    g.manualTotal = totals[g.key]?.total || null;
    g.total = Math.max(g.manualTotal || 0, maxNo, g.books.length);
    const isDone = b => statusOf(b, b.percent) === "done";
    g.done = g.books.filter(isDone).length;
    const have = new Set(nos.map(Math.floor));
    g.missing = [];
    for (let n = 1; n <= (nos.length ? g.total : 0); n++) if (!have.has(n)) g.missing.push(n);
    // следующая: первый номер по порядку, который ещё не прочитан (книги с этим номером может не быть на полке)
    g.next = null;
    for (let n = 1; n <= g.total && nos.length; n++) {
      const book = g.books.find(b => Math.floor(b.seriesNo) === n) || null;
      if (!book || !isDone(book)) { g.next = { no: n, book }; break; }
    }
    if (!nos.length) {                                 // номеров нет вовсе — просто первая непрочитанная
      const book = g.books.find(b => !isDone(b));
      g.next = book ? { no: null, book } : null;
    }
    // «продолжить»: начатая книга серии, иначе следующая, если она есть на полке
    const reading = g.books.filter(b => statusOf(b, b.percent) === "reading").sort((a, b) => (b.opened || 0) - (a.opened || 0))[0];
    // (если следующей нет на полке — ближайшая непрочитанная после неё)
    const after = g.next && !g.next.book ? g.books.find(b => !isDone(b) && (b.seriesNo ?? 1e9) > g.next.no) : null;
    g.cont = reading || g.next?.book || after || null;
    list.push(g);
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

// названия всех серий на полке — подсказка при ручном вводе
export const seriesNames = books => [...new Map(books.filter(b => b.series?.trim()).map(b => [seriesKey(b.series), b.series.trim()])).values()];
