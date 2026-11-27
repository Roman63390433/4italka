// Робот главной: раз в день собирает data/home.json
//   — новинки FantLab (описание, жанры, обложка),
//   — новости из нескольких литературных лент.
// Запуск: node tools/build-home.mjs   (Node 20+, без npm-пакетов)
// Запускает его GitHub (.github/workflows/home.yml), но можно и руками.
//
// Правила:
//   • ничего не выдумываем: описания и жанры только из FantLab, нет — пусто;
//   • одна книга не загрузилась — пропускаем её, а не падаем;
//   • источник новостей упал — берём его новости из прошлого data/home.json;
//   • если по сути ничего не поменялось — файл не трогаем (робот не коммитит зря).

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'home.json');

const API = 'https://api.fantlab.ru';
const SITE = 'https://fantlab.ru';
const PAGES = 8;          // сколько страниц новинок FantLab смотреть (по 30 изданий)
const FRESH = 40;         // столько самых свежих новинок берём всегда, даже без жанров
const MAX_BOOKS = 100;    // всего книг в файле не больше
const PAUSE = 350;        // пауза между запросами к FantLab, мс (не нагружаем сайт)
const MAX_NEWS = 30;
const NEWS_PER_SOURCE = 15;

// ---------- Вкладки-жанры ----------
// Порядок вкладок на главной. Жанр FantLab (метка из классификатора, группа
// «Жанры/поджанры») попадает во вкладку, если подходит под regexp.
// Порядок проверки важен: «Технофэнтези» — это фэнтези, а не фантастика.
const TABS = [
  { id: 'fantasy',   name: 'Фэнтези',            re: /фэнтези/ },
  { id: 'sf',        name: 'Фантастика',         re: /фантастик|киберпанк|космоопер|постапокалип|антиутоп|альтернативн/ },
  { id: 'horror',    name: 'Мистика и ужасы',    re: /мистик|хоррор|ужас/ },
  { id: 'detective', name: 'Детективы и триллеры', re: /детектив|триллер/ },
  { id: 'romance',   name: 'Любовный роман',     re: /любовн/ },
  { id: 'prose',     name: 'Проза',              re: /реализм|проза/ },
  { id: 'fairytale', name: 'Сказки',             re: /сказк|притч/ },
  { id: 'humor',     name: 'Юмор',               re: /юмор|сатир/ },
];

// ---------- Источники новостей ----------
// filter — оставить только записи про книги (у «Мира фантастики» много кино и игр).
const BOOKWORDS = /книг|роман|писател|литератур|издан|издательств|премия|автор|рассказ|повест|переизда|fanzon|эксмо|аст\b/i;
const NEWS_SOURCES = [
  { name: 'Год литературы',       type: 'rss', url: 'https://godliteratury.ru/rss' },
  { name: 'Литературная Россия',  type: 'rss', url: 'https://litrossia.ru/feed/' },
  { name: 'Мир фантастики',       type: 'rss', url: 'https://www.mirf.ru/feed/',
    filter: (n) => /mirf\.ru\/book/.test(n.url) || BOOKWORDS.test(n.title) },
  { name: 'FantLab',              type: 'fantlab' },
];

// ---------- Сеть: повторы и паузы ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (compatible; chitalka-home-robot; +https://github.com/Roman63390433/4italka)';

async function getText(url, tries = 3) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'ru' },
        signal: AbortSignal.timeout(25000),
      });
      if (res.status === 404) throw Object.assign(new Error('404 ' + url), { fatal: true });
      if (!res.ok) throw new Error(res.status + ' ' + url);
      return await res.text();
    } catch (e) {
      lastErr = e;
      if (e.fatal) break;                 // 404 — повторять бессмысленно
      if (i < tries) await sleep(1500 * i); // 1,5 с, потом 3 с
    }
  }
  throw lastErr;
}

let lastFantlab = 0;
async function fantlab(path) {
  const wait = lastFantlab + PAUSE - Date.now();
  if (wait > 0) await sleep(wait);
  try {
    return JSON.parse(await getText(API + path));
  } finally {
    lastFantlab = Date.now();
  }
}

// ---------- Чистка текста ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»',
  mdash: '—', ndash: '–', hellip: '…', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', copy: '©' };
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

// Разметка FantLab: [autor=3]Роджер Желязны[/autor], [work=1]..[/work], [pub=33]АСТ[/pub],
// [b]..[/b], [PHOTO1RIGHT], [url=..]..[/url] и т. п. Текст внутри оставляем, теги убираем.
const FL_TAGS = 'autor|work|pub|series|edition|art|award|film|user|translator|dictor|link|url|b|i|u|s|q|quote|spoiler|h|center|right|left|img|list|li|p|br|hr|small|big|sub|sup|color|size|font';
const FL_TAG_RE = new RegExp(`\\[\\/?(?:${FL_TAGS})(?:=[^\\]]*)?\\]|\\[PHOTO\\d*[A-Z]*\\]`, 'gi');

function cleanText(s) {
  if (!s) return '';
  let t = String(s)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')       // HTML-теги (в FantLab встречаются <a href>)
    .replace(FL_TAG_RE, '');
  t = decodeEntities(t).replace(/\r\n?/g, '\n');
  // абзацы — через одиночный \n, без пустых строк и лишних пробелов
  return t.split('\n').map((l) => l.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean).join('\n');
}
const oneLine = (s) => cleanText(s).replace(/\n+/g, ' ').trim();

// ---------- Жанры ----------
// Все метки из группы «Жанры/поджанры» (genre_group_id = 1), включая вложенные.
// Сайт FantLab показывает классификатор только когда проголосовало несколько человек
// (проверено 27.11.2026: при 5 голосах жанры на странице есть, при 4 и меньше — нет), а API
// отдаёт и единичные голоса. Берём как на сайте — от MIN_VOTES проголосовавших.
const MIN_VOTES = 5;
function genreLabels(work) {
  if ((work?.classificatory?.total_count || 0) < MIN_VOTES) return [];
  const groups = work?.classificatory?.genre_group || [];
  const g1 = groups.find((g) => g.genre_group_id === 1);
  const out = [];
  const walk = (arr) => { for (const x of arr || []) { if (x.label) out.push(x.label); walk(x.genre); } };
  walk(g1?.genre);
  return out;
}
function labelsToTabs(labels) {
  const ids = new Set();
  for (const label of labels) {
    const l = label.toLowerCase();
    const tab = TABS.find((t) => t.re.test(l));
    if (tab) ids.add(tab.id);
  }
  return TABS.filter((t) => ids.has(t.id)).map((t) => t.id); // в порядке вкладок
}

// ---------- Книги ----------
async function buildBook(o) {
  const editionId = o.edition_id;
  const edition = await fantlab(`/edition/${editionId}`);
  const workId = o.the_only_work?.work_id ?? edition.edition_work_id ?? null;
  let work = null;
  if (workId) {
    try { work = await fantlab(`/work/${workId}/extended`); }
    catch (e) { console.warn(`  ! произведение ${workId}: ${e.message}`); }
  }

  let authors = (edition.creators?.authors || []).map((a) => oneLine(a.name)).filter(Boolean);
  if (!authors.length && work) {
    authors = (work.authors || []).filter((a) => a.type === 'autor' || a.role === 'autor')
      .map((a) => oneLine(a.name)).filter(Boolean);
  }
  if (!authors.length && o.autors) authors = oneLine(o.autors).split(/,\s*/).filter(Boolean);

  const image = edition.image || (o.pic_orig ? `/images/editions/big/${editionId}` : null);

  return {
    id: workId ? `fl-w${workId}` : `fl-e${editionId}`,
    workId: workId ?? null,
    editionId,
    title: oneLine(o.name || edition.edition_name),
    authors,
    year: edition.year || work?.work_year || null,
    date: oneLine(o.date),
    publisher: oneLine(o.publisher),
    series: oneLine(o.series) || null,
    description: cleanText(work?.work_description) || cleanText(edition.description) || '',
    genres: labelsToTabs(genreLabels(work)),
    cover: image ? SITE + image : null,
    url: workId ? `${SITE}/work${workId}` : `${SITE}/edition${editionId}`,
  };
}

async function buildBooks() {
  const books = [];
  const seen = new Set();
  let index = 0;
  for (let page = 1; page <= PAGES; page++) {
    let list;
    try { list = (await fantlab(`/pubnews?page=${page}`)).objects || []; }
    catch (e) { console.warn(`! новинки, страница ${page}: ${e.message}`); continue; }
    for (const o of list) {
      index++;
      try {
        const book = await buildBook(o);
        if (seen.has(book.id)) continue;           // одно произведение в двух изданиях
        if (index > FRESH && !book.genres.length) continue; // старше — только с жанрами
        seen.add(book.id);
        books.push(book);
        console.log(`  ${book.id} ${book.title} [${book.genres.join(',')}]`);
      } catch (e) {
        console.warn(`  ! издание ${o.edition_id} «${o.name}» пропущено: ${e.message}`);
      }
      if (books.length >= MAX_BOOKS) return books;
    }
  }
  return books;
}

function buildGenres(books) {
  const count = {};
  for (const b of books) for (const g of b.genres) count[g] = (count[g] || 0) + 1;
  let tabs = TABS.filter((t) => count[t.id]);   // пустые не выводим
  if (tabs.length > 8) {
    const keep = new Set([...tabs].sort((a, b) => count[b.id] - count[a.id]).slice(0, 8).map((t) => t.id));
    tabs = tabs.filter((t) => keep.has(t.id));
  }
  return tabs.map((t) => ({ id: t.id, name: t.name }));
}

// ---------- Новости ----------
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  if (!m) return '';
  return m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim();
}
function toIso(s) {
  // FantLab пишет пояс как «+03» — JS понимает только «+03:00»
  const d = new Date(String(s || '').trim().replace(/([+-]\d\d)$/, '$1:00'));
  return isNaN(d) ? null : d.toISOString();
}

// RSS 2.0 (<item>) и Atom (<entry>) без библиотек — простым разбором.
function parseFeed(xml) {
  const out = [];
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    let url = tag(b, 'link');
    if (!url) {
      const alt = b.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/i) || b.match(/<link[^>]*href="([^"]+)"/i);
      url = alt ? alt[1] : '';
    }
    const date = toIso(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'));
    out.push({ title: oneLine(tag(b, 'title')), date, url: decodeEntities(url.trim()) });
  }
  return out;
}

async function loadSource(src) {
  if (src.type === 'fantlab') {
    // Лента новостей FantLab: «в мире Ф&Ф» берём все. «На сайте» — в основном внутренние
    // заметки («составлена библиография» с названием из одного имени автора), из них
    // берём только те, где в названии есть кавычки (книга, серия, журнал).
    const out = [];
    for (let page = 1; page <= 3; page++) {
      const j = await fantlab(`/news?page=${page}`);
      for (const n of j.items || []) {
        if (n.category === 'на сайте' && !/[«"“„]/.test(n.title || '')) continue;
        out.push({ title: oneLine(n.title), date: toIso(n.news_date_iso), url: `${SITE}/news${n.news_id}` });
      }
    }
    return out;
  }
  let items = parseFeed(await getText(src.url, 2));
  if (src.filter) items = items.filter(src.filter);
  return items;
}

async function buildNews(prevNews) {
  const all = [];
  for (const src of NEWS_SOURCES) {
    let items;
    try {
      items = (await loadSource(src))
        .filter((n) => n.title && n.date && /^https?:\/\//.test(n.url))
        .map((n) => ({ title: n.title, source: src.name, date: n.date, url: n.url }));
      if (!items.length) throw new Error('нет подходящих записей');
      console.log(`  ${src.name}: ${items.length}`);
    } catch (e) {
      items = prevNews.filter((n) => n.source === src.name);
      console.warn(`  ! ${src.name}: ${e.cause?.code || e.message} — из прошлого файла: ${items.length}`);
    }
    items.sort((a, b) => b.date.localeCompare(a.date));
    all.push(...items.slice(0, NEWS_PER_SOURCE));
  }
  const seen = new Set();
  return all
    .filter((n) => !seen.has(n.url) && seen.add(n.url))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_NEWS);
}

// ---------- Главное ----------
async function main() {
  let prev = null;
  try { prev = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* первого файла ещё нет */ }

  console.log('Новинки FantLab…');
  let books = await buildBooks();
  if (!books.length) {
    if (!prev?.books?.length) throw new Error('FantLab не отдал ни одной книги, а прошлого файла нет');
    console.warn('! FantLab не отдал книг — оставляю книги из прошлого файла');
    books = prev.books;
  }
  const genres = buildGenres(books);

  console.log('Новости…');
  const news = await buildNews(prev?.news || []);

  const body = { genres, books, news };
  // Если по сути ничего не изменилось — сохраняем старую дату: файл не меняется, коммита не будет.
  const same = prev && JSON.stringify({ genres: prev.genres, books: prev.books, news: prev.news }) === JSON.stringify(body);
  const result = { updated: same ? prev.updated : new Date().toISOString(), ...body };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(result, null, 1) + '\n', 'utf8');

  const perTab = genres.map((g) => `${g.name} ${books.filter((b) => b.genres.includes(g.id)).length}`).join(', ');
  console.log(`Готово: книг ${books.length} (без жанров ${books.filter((b) => !b.genres.length).length}), вкладки: ${perTab}; новостей ${news.length}${same ? ' (без изменений)' : ''}`);
}

main().catch((e) => { console.error('Ошибка:', e); process.exit(1); });
