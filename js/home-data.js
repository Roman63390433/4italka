// Данные главной: новинки и новости (data/home.json — собирает робот GitHub раз в день)
// и каталог классики (data/catalog.json). Только чтение и проверка формата, без кнопок.
// Без интернета ответ даёт Service Worker из кеша (последний сохранённый файл).

// Откуда брать данные — одна настройка. Позже можно поставить адрес своего сервера, например "https://….ru/data/".
export const DATA_BASE = "data/";

async function getJson(name) {
  const r = await fetch(DATA_BASE + name, { cache: "no-cache" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

const arr = v => (Array.isArray(v) ? v : []);
const str = v => (typeof v === "string" ? v.trim() : "");

// home.json → { updated, genres, books, news } или null, если файла нет и в кеше
export async function loadHome() {
  let d;
  try { d = await getJson("home.json"); } catch { return null; }
  const genres = arr(d.genres).filter(g => g && str(g.id) && str(g.name));
  const books = arr(d.books)
    .filter(b => b && str(b.title))
    .map(b => ({
      id: str(b.id) || "fl-" + (b.workId || b.editionId),
      workId: b.workId || null, editionId: b.editionId || null,
      title: str(b.title), authors: arr(b.authors).map(str).filter(Boolean),
      year: b.year || null, date: str(b.date), publisher: str(b.publisher), series: str(b.series),
      description: str(b.description), genres: arr(b.genres).map(str),
      cover: str(b.cover) || null, url: str(b.url),
    }));
  const news = arr(d.news)
    .filter(n => n && str(n.title) && /^https?:\/\//.test(str(n.url)))
    .map(n => ({ title: str(n.title), source: str(n.source), date: str(n.date), url: str(n.url) }));
  return { updated: str(d.updated), genres, books, news };
}

// catalog.json → { updated, books, collections } или null
export async function loadCatalog() {
  let d;
  try { d = await getJson("catalog.json"); } catch { return null; }
  const books = arr(d.books)
    .filter(b => b && str(b.id) && str(b.title) && str(b.page))
    .map(b => ({
      id: str(b.id), title: str(b.title), author: str(b.author), year: b.year || null,
      genre: str(b.genre), page: str(b.page), chapters: b.chapters || 1,
      description: str(b.description), size: b.size || null,
    }));
  const ids = new Set(books.map(b => b.id));
  const collections = arr(d.collections)
    .map(c => ({ id: str(c.id), name: str(c.name), ids: arr(c.ids).filter(id => ids.has(id)) }))
    .filter(c => c.name && c.ids.length);
  return { updated: str(d.updated), books, collections };
}
