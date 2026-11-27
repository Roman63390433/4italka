// «Хочу прочитать»: книга на полке без файла (карточка из каталога FantLab / Викитеки).
// Только правила и данные, без кнопок. Запись лежит в том же ящике books, что и обычные книги,
// но с полем wish: true и без записи в ящике files. Когда файл появится — привязываем его к этой записи.
import { listBooks, updateBook } from "./storage.js";

export const isWish = b => !!b?.wish;

// название / автор «для сравнения»: без регистра, ё = е, без знаков препинания и лишних пробелов
export const norm = s => String(s || "").toLowerCase().replace(/ё/g, "е")
  .replace(/[«»"'„“”.,:;!?()[\]\-–—]/g, " ").replace(/\s+/g, " ").trim();

// фамилии авторов: последнее слово каждого автора («Фёдор Михайлович Достоевский» → «достоевский»)
const surnames = author => String(author || "").split(/,|;| и /)
  .map(a => norm(a).split(" ").filter(w => w.length > 1).pop()).filter(Boolean);

// одна ли это книга: название совпадает; авторы совпадают целиком или хотя бы по фамилии
// (в FantLab «Фёдор Достоевский», а в файле «Фёдор Михайлович Достоевский»).
// Если у одной из книг автор не указан — сравниваем только название.
export function sameBook(a, b) {
  if (!a || !b || !norm(a.title) || norm(a.title) !== norm(b.title)) return false;
  const aa = norm(a.author), ba = norm(b.author);
  if (!aa || !ba || aa === ba) return true;
  const sa = surnames(a.author), sb = surnames(b.author);
  return sa.some(s => sb.includes(s));
}

// книга «хочу» на полке с тем же названием и автором (или null)
export function findWishFor(books, title, author) {
  return books.find(b => isWish(b) && sameBook(b, { title, author })) || null;
}

// безопасная ссылка: только http/https (данные приходят из интернета)
const safeUrl = u => { try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };

// скачать обложку в Blob; если сайт не разрешает (нет CORS) или нет интернета — null, тогда покажем по ссылке
async function fetchCover(url) {
  if (!url) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) return null;
    const blob = await r.blob();
    return blob.type.startsWith("image/") && blob.size > 0 ? blob : null;
  } catch { return null; }
  finally { clearTimeout(t); }
}

const newId = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();

// положить на полку книгу без файла. Уже есть такая (по key или названию+автору) — вернём её, без дубля.
export async function addWish({ title, authors = [], year = null, publisher = "", description = "", genres = [],
  coverUrl = "", source = "", sourceUrl = "", key = "" } = {}) {
  title = String(title || "").trim();
  if (!title) throw new Error("У книги нет названия");
  const author = (Array.isArray(authors) ? authors : [authors]).map(a => String(a || "").trim()).filter(Boolean).join(", ");

  const books = await listBooks();
  const same = (key && books.find(b => b.key === key)) || books.find(b => sameBook(b, { title, author }));
  if (same) return { book: same, existed: true };

  const cUrl = safeUrl(coverUrl);
  const book = {
    id: newId(), wish: true,
    title, author,
    year: year || null, publisher: publisher || "", description: description || "",
    genres: Array.isArray(genres) ? genres.filter(Boolean) : [],
    cover: await fetchCover(cUrl), coverUrl: cUrl || "",
    source: source || "", sourceUrl: safeUrl(sourceUrl) || "", key: key || "",
    format: null, size: 0, chars: 0, series: null, seriesNo: null,
    status: "want", statusAt: Date.now(), scanned: 1,      // scanned: файла нет — перечитывать нечего
    added: Date.now(), opened: 0,
  };
  await updateBook(book);
  return { book, existed: false };
}

// запись книги после привязки файла: id, название, автор, статус, серия, описание — от «хочу»
// (название из каталога обычно чище, чем в файле); формат и размер — из файла.
// Обложка из файла важнее; нет её — остаётся обложка из каталога.
export function mergeFile(wish, parsed, file) {
  const { wish: _w, ...rest } = wish;
  return {
    ...rest,
    title: wish.title || parsed.title, author: wish.author || parsed.author,
    format: parsed.format, size: file.size, chars: parsed.chars,
    cover: parsed.cover || wish.cover || null,
    coverUrl: parsed.cover ? "" : wish.coverUrl || "",
    series: wish.series || parsed.series || null,
    seriesNo: wish.series ? wish.seriesNo ?? null : parsed.seriesNo ?? null,
    scanned: 1,
  };
}

// ссылка «Где взять» — поиск на Литресе (открывается в браузере)
export const litresUrl = b => "https://www.litres.ru/search/?q=" + encodeURIComponent([b.title, b.author].filter(Boolean).join(" "));
