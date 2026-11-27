// Каталог классики: книга дня, авторы, поиск. Только расчёты над данными из catalog.json, без кнопок.

import { norm } from "./wish.js";   // строка для сравнения: без регистра, ё = е, без знаков

// номер дня от 1.1.1970 по местному времени — книга дня меняется в полночь
const dayNo = date => Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000);

// книга дня: по кругу по каталогу; книги с описанием — в приоритете (о них есть что сказать)
export function bookOfDay(books, date = new Date()) {
  const pool = books.filter(b => b.description);
  const list = pool.length >= 7 ? pool : books;
  return list.length ? list[dayNo(date) % list.length] : null;
}

// фамилия для кружка: «Николай Гоголь» → «Гоголь»
export const surname = name => (name || "").split(/\s+/).filter(Boolean).pop() || "";

// авторы по числу книг в каталоге: [{ name, short, letter, books }]
export function authorsOf(books) {
  const map = new Map();
  for (const b of books) {
    if (!b.author) continue;
    if (!map.has(b.author)) map.set(b.author, []);
    map.get(b.author).push(b);
  }
  return [...map].map(([name, list]) => ({
    name, short: surname(name), letter: surname(name).charAt(0).toUpperCase(),
    books: list.sort((a, b) => (a.year || 0) - (b.year || 0)),
  })).sort((a, b) => b.books.length - a.books.length || a.short.localeCompare(b.short, "ru"));
}

// поиск: все слова запроса должны найтись в названии, авторе или жанре
export function matchBooks(list, q, fields) {
  const words = norm(q).split(" ").filter(Boolean);
  if (!words.length) return [];
  return list.filter(item => {
    const hay = norm(fields(item).join(" "));
    return words.every(w => hay.includes(w));
  });
}

export const searchCatalog = (books, q) => matchBooks(books, q, b => [b.title, b.author, b.genre]);

// книги подборки по её списку id
export function collectionBooks(catalog, c) {
  const byId = new Map(catalog.books.map(b => [b.id, b]));
  return c.ids.map(id => byId.get(id)).filter(Boolean);
}

// «Час чтения» и т. п. — по числу букв (≈ 1000 знаков в минуту)
export function readTime(size) {
  if (!size) return "";
  const min = Math.round(size / 1000);
  if (min < 50) return `≈ ${Math.max(5, Math.round(min / 5) * 5)} мин чтения`;
  const h = Math.round(min / 60);
  return `≈ ${h} ч чтения`;
}
