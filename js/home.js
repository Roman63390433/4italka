// Главная: поиск, книга дня, новинки по жанрам (FantLab), подборки и авторы классики (Викитека), новости,
// карточка книги. Только интерфейс: данные — home-data.js, расчёты — catalog.js и fantlab.js.
import { loadHome, loadCatalog } from "./home-data.js";
import { bookOfDay, authorsOf, searchCatalog, collectionBooks, matchBooks, readTime } from "./catalog.js";
import { searchWorks, workDetails } from "./fantlab.js";
import { addWish, sameBook, litresUrl } from "./wish.js";
import { showWish } from "./wish-ui.js";
import { listBooks } from "./storage.js";
import { openSheet, closeSheet, toast } from "./sheet.js";
import { coverEl } from "./covers.js";
import { importFiles, renderShelf } from "./shelf.js";

const $ = id => document.getElementById(id);
const GENRE_KEY = "chitalka.homeGenre";
let home = null, catalog = null, loaded = null;
let genre = localStorage.getItem(GENRE_KEY) || "all";
let newsOpen = false;
let openBook = () => {}, showShelf = () => {};

// маленький помощник: элемент с классом и текстом
function h(tag, cls = "", text = "") {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text) el.textContent = text;
  return el;
}

export function initHome(opts) {
  openBook = opts.openBook;
  showShelf = opts.showShelf;
  let timer;
  $("homeSearch").oninput = () => { clearTimeout(timer); timer = setTimeout(runSearch, 350); };
  $("homeSearch").onkeydown = e => { if (e.key === "Enter") { clearTimeout(timer); runSearch(); e.target.blur(); } };
  document.querySelectorAll("#homeJump button").forEach(b =>
    b.onclick = () => $(b.dataset.to)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  $("newsMore").onclick = () => { newsOpen = !newsOpen; renderNews(); };
}

// загрузить данные (один раз; при каждом показе главной — перерисовать)
export async function renderHome() {
  if (!loaded) loaded = Promise.all([loadHome(), loadCatalog()]).then(([a, b]) => { home = a; catalog = b; });
  await loaded;
  renderDay();
  renderNew();
  renderClassic();
  renderAuthors();
  renderNews();
  renderSources();
}

// ================= книга дня =================
function renderDay() {
  const b = catalog && bookOfDay(catalog.books);
  $("daySec").hidden = !b;
  if (!b) return;
  $("dayTitle").textContent = b.title;
  $("dayAuthor").textContent = [b.author, [b.genre, b.year].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  $("dayDesc").textContent = b.description;
  $("dayDesc").hidden = !b.description;
  $("dayTime").textContent = readTime(b.size);
  $("daySec").onclick = () => showClassic(b);
}

// ================= новинки =================
function renderNew() {
  const chips = $("genreChips"), row = $("newRow"), note = $("newNote");
  chips.innerHTML = ""; row.innerHTML = "";
  if (!home || !home.books.length) {
    chips.hidden = true;
    note.hidden = false;
    note.textContent = "Новинки появятся, когда телефон будет в сети.";
    return;
  }
  note.hidden = true;
  const used = home.genres.filter(g => home.books.some(b => b.genres.includes(g.id)));
  if (genre !== "all" && !used.some(g => g.id === genre)) genre = "all";
  chips.hidden = !used.length;
  for (const g of [{ id: "all", name: "Все" }, ...used]) {
    const c = h("button", "fchip" + (g.id === genre ? " on" : ""), g.name);
    c.setAttribute("aria-pressed", g.id === genre);
    c.onclick = () => { genre = g.id; localStorage.setItem(GENRE_KEY, genre); renderNew(); row.scrollLeft = 0; };
    chips.appendChild(c);
  }
  const list = genre === "all" ? home.books : home.books.filter(b => b.genres.includes(genre));
  for (const b of list) row.appendChild(tile(b.title, b.authors[0], b.cover, () => showFantlab(b)));
}

// обложка + название + автор (для рядов, которые листаются вбок)
function tile(title, author, coverUrl, onTap) {
  const li = h("li");
  const btn = h("button", "tile-btn");
  btn.append(coverEl({ title, author, coverUrl }, "big"), h("span", "t-title", title), h("span", "t-author", author || ""));
  btn.onclick = onTap;
  li.appendChild(btn);
  return li;
}

// ================= классика: подборки =================
function renderClassic() {
  const box = $("collections");
  box.innerHTML = "";
  $("classicSec").hidden = !catalog;
  if (!catalog) return;
  for (const c of catalog.collections) {
    const sec = h("section", "coll");
    sec.appendChild(h("h3", "coll-title", c.name));
    const row = h("ul", "hrow");
    for (const b of collectionBooks(catalog, c)) row.appendChild(tile(b.title, b.author, null, () => showClassic(b)));
    sec.appendChild(row);
    box.appendChild(sec);
  }
}

// ================= авторы =================
function renderAuthors() {
  const ul = $("authors");
  ul.innerHTML = "";
  $("authorsSec").hidden = !catalog;
  if (!catalog) return;
  for (const a of authorsOf(catalog.books).slice(0, 12)) {
    const li = h("li");
    const btn = h("button", "author-btn");
    btn.append(h("b", "", a.letter), h("span", "", a.short));
    btn.setAttribute("aria-label", `${a.name}: ${a.books.length} кн.`);
    btn.onclick = () => showAuthor(a);
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

function showAuthor(a) {
  const box = $("bookCard");
  box.innerHTML = "";
  box.appendChild(h("h2", "sheet-title", a.name));
  box.appendChild(h("p", "muted", `В каталоге классики: ${a.books.length}`));
  box.appendChild(resultList(a.books.map(b => ({
    title: b.title, sub: [b.genre, b.year].filter(Boolean).join(", "), tap: () => showClassic(b),
  }))));
  openSheet("bookSheet");
}

// ================= новости =================
const MONTHS = ["янв.", "февр.", "марта", "апр.", "мая", "июня", "июля", "авг.", "сент.", "окт.", "нояб.", "дек."];
function newsDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return "сегодня";
  if (days === 1) return "вчера";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function renderNews() {
  const ul = $("news");
  ul.innerHTML = "";
  const list = home?.news || [];
  $("newsSec").hidden = false;
  $("newsEmpty").hidden = list.length > 0;
  const shown = newsOpen ? list : list.slice(0, 5);
  for (const n of shown) {
    const li = h("li");
    const a = h("a");
    a.href = n.url; a.target = "_blank"; a.rel = "noopener";
    a.append(h("span", "n-src", [n.source, newsDate(n.date)].filter(Boolean).join(" · ")), h("span", "n-t", n.title));
    li.appendChild(a);
    ul.appendChild(li);
  }
  $("newsMore").hidden = list.length <= 5;
  $("newsMore").textContent = newsOpen ? "Свернуть" : `Ещё новости (${list.length - 5})`;
}

function renderSources() {
  const parts = [];
  if (home) parts.push("Новинки и описания — FantLab");
  if (catalog) parts.push("классика — Викитека");
  if (home?.news.length) parts.push("новости — " + [...new Set(home.news.map(n => n.source).filter(Boolean))].join(", "));
  let text = parts.join(", ");
  if (home?.updated) {
    const d = new Date(home.updated);
    if (!isNaN(d)) text += `. Обновлено ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }
  $("homeSources").textContent = text ? text + "." : "";
}

// ================= поиск =================
let searchCtl = null;
async function runSearch() {
  const q = $("homeSearch").value.trim();
  const box = $("homeResults");
  searchCtl?.abort();
  $("homeMain").hidden = !!q;
  box.hidden = !q;
  if (!q) return;
  box.innerHTML = "";

  // своя полка
  const mine = matchBooks(await listBooks(), q, b => [b.title, b.author]);
  if (mine.length) box.appendChild(resultGroup("На полке", mine.slice(0, 10).map(b => ({
    title: b.title, sub: b.author, tap: () => openShelfBook(b),
  }))));

  // новинки (в том числе по названию жанра)
  if (home) {
    const gname = id => home.genres.find(g => g.id === id)?.name || "";
    const fresh = matchBooks(home.books, q, b => [b.title, ...b.authors, ...b.genres.map(gname)]);
    if (fresh.length) box.appendChild(resultGroup("Новинки", fresh.slice(0, 10).map(b => ({
      title: b.title, sub: b.authors.join(", "), tap: () => showFantlab(b),
    }))));
  }

  // классика
  if (catalog) {
    const cl = searchCatalog(catalog.books, q);
    if (cl.length) box.appendChild(resultGroup("Классика — можно скачать", cl.slice(0, 20).map(b => ({
      title: b.title, sub: [b.author, b.year].filter(Boolean).join(", "), tap: () => showClassic(b),
    }))));
  }

  // FantLab вживую
  const fl = h("section", "res-group");
  fl.appendChild(h("h2", "sec", "FantLab"));
  const status = h("p", "muted res-status", q.length < 3 ? "Наберите хотя бы 3 буквы." : "Ищу…");
  fl.appendChild(status);
  box.appendChild(fl);
  if (q.length < 3) return;
  if (!navigator.onLine) { status.textContent = "Нет интернета — поиск по FantLab недоступен."; return; }
  const ctl = searchCtl = new AbortController();
  try {
    const found = await searchWorks(q, { signal: ctl.signal });
    if (ctl.signal.aborted) return;
    if (!found.length) { status.textContent = "Ничего не нашлось."; return; }
    status.remove();
    fl.appendChild(resultList(found.map(b => ({
      title: b.title, sub: [b.authors.join(", "), b.type, b.year].filter(Boolean).join(" · "), tap: () => showFantlab(b),
    }))));
  } catch (e) {
    if (e.name !== "AbortError") status.textContent = "FantLab не ответил. Попробуйте позже.";
  }
}

function resultGroup(name, items) {
  const sec = h("section", "res-group");
  sec.append(h("h2", "sec", name), resultList(items));
  return sec;
}

function resultList(items) {
  const ul = h("ul", "res-list");
  for (const it of items) {
    const li = h("li");
    const btn = h("button", "res-btn");
    btn.append(h("span", "r-title", it.title), h("span", "r-sub", it.sub || ""));
    btn.onclick = it.tap;
    li.appendChild(btn);
    ul.appendChild(li);
  }
  return ul;
}

async function openShelfBook(b) {
  await closeSheet();
  showShelf();
  if (b.wish) showWish(b.id); else openBook(b.id);
}

// ================= карточка книги =================
function cardHead(box, { title, authors, coverUrl, meta }) {
  const head = h("div", "card-head");
  const text = h("div", "card-text");
  text.append(h("h2", "b-title", title), h("p", "b-author", authors.join(", ")));
  if (meta) text.appendChild(h("p", "b-meta", meta));
  head.append(coverEl({ title, author: authors[0], coverUrl }, "big"), text);
  box.appendChild(head);
}

function cardGenres(box, labels) {
  if (!labels.length) return;
  const ul = h("ul", "card-genres");
  labels.forEach(l => ul.appendChild(h("li", "", l)));
  box.appendChild(ul);
}

function cardDesc(box, text) {
  const d = h("div", "card-desc");
  (text || "").split(/\n+/).filter(Boolean).forEach(p => d.appendChild(h("p", "", p)));
  box.appendChild(d);
  return d;
}

function cardLink(box, href, text) {
  const a = h("a", "card-link", text);
  a.href = href; a.target = "_blank"; a.rel = "noopener";
  box.appendChild(a);
}

// новинка или находка с FantLab: «Хочу прочитать», «Где взять»
async function showFantlab(b) {
  const box = $("bookCard");
  box.innerHTML = "";
  const meta = [b.type, b.year, b.publisher].filter(Boolean).join(" · ");
  cardHead(box, { title: b.title, authors: b.authors, coverUrl: b.cover, meta });
  const gname = id => home?.genres.find(g => g.id === id)?.name;
  const genresBox = h("div");
  box.appendChild(genresBox);
  cardGenres(genresBox, b.genres.map(gname).filter(Boolean));
  const btns = h("div", "card-btns");
  const want = h("button", "primary", "Хочу прочитать");
  const where = h("button", "secondary", "Где взять");
  btns.append(want, where);
  box.appendChild(btns);
  const desc = cardDesc(box, b.description);
  if (b.url) cardLink(box, b.url, "Страница на FantLab");
  openSheet("bookSheet");

  const author = b.authors[0] || "";
  const onShelf = (await listBooks()).find(x => sameBook(x, { title: b.title, author }));
  if (onShelf) { want.textContent = onShelf.wish ? "Уже в «Хочу прочитать»" : "Уже на полке"; want.disabled = true; }

  where.onclick = () => window.open(litresUrl({ title: b.title, author }), "_blank", "noopener");
  let details = null;
  want.onclick = async () => {
    want.disabled = true;
    try {
      const r = await addWish({
        title: b.title, authors: b.authors, year: b.year, publisher: b.publisher,
        description: details?.description || b.description,
        genres: details?.genreLabels?.length ? details.genreLabels : b.genres.map(gname).filter(Boolean),
        coverUrl: details?.cover || b.cover, source: "fantlab", sourceUrl: b.url, key: b.id,
      });
      renderShelf();
      want.textContent = r?.existed ? "Уже на полке" : "На полке ✓";
      toast(r?.existed ? `«${b.title}» уже на полке` : `«${b.title}» — в «Хочу прочитать»`, 3200,
        { text: "Полка", fn: () => { closeSheet().then(showShelf); } });
    } catch (e) {
      want.disabled = false;
      toast("Не удалось сохранить: " + e.message, 5000);
    }
  };

  // описания и жанров нет в результатах поиска — дозагружаем; не вышло — показываем без них
  if (b.workId && (!b.description || !b.genres.length)) {
    desc.appendChild(h("p", "muted", "Загружаю описание…"));
    try {
      details = await workDetails(b.workId);
      if (!desc.isConnected) return;        // пока грузили, открыли другую карточку
      const fresh = cardDesc(h("div"), b.description || details.description);
      desc.replaceWith(fresh);
      if (!b.genres.length) cardGenres(genresBox, details.genreLabels);
      if (!b.cover && details.cover) box.querySelector(".card-head .cover")?.replaceWith(
        coverEl({ title: b.title, author, coverUrl: details.cover }, "big"));
    } catch {
      desc.innerHTML = "";
    }
  }
}

// книга классики: «Добавить на полку» (скачать с Викитеки)
async function showClassic(b) {
  const box = $("bookCard");
  box.innerHTML = "";
  const meta = [b.genre, b.year, readTime(b.size)].filter(Boolean).join(" · ");
  cardHead(box, { title: b.title, authors: [b.author], coverUrl: null, meta });
  const btns = h("div", "card-btns");
  const add = h("button", "primary", "Добавить на полку");
  btns.appendChild(add);
  box.appendChild(btns);
  cardDesc(box, b.description);
  cardLink(box, "https://ru.wikisource.org/wiki/" + encodeURIComponent(b.page.replace(/ /g, "_")), "Текст на Викитеке");
  openSheet("bookSheet");

  const onShelf = (await listBooks()).find(x => !x.wish && sameBook(x, b));
  if (onShelf) {
    add.textContent = "Читать";
    add.onclick = () => openShelfBook(onShelf);
    return;
  }
  add.onclick = async () => {
    if (!navigator.onLine) { toast("Нет интернета — скачать не получится"); return; }
    add.disabled = true;
    add.textContent = "Скачиваю…";
    try {
      const { fetchBook } = await import("./wikisource.js");
      const file = await fetchBook(b, (done, total) => {
        if (total > 1) add.textContent = `Скачиваю… ${done} из ${total}`;
      });
      add.textContent = "Добавляю…";
      const added = await importFiles([file]);
      const book = added?.[0];
      add.disabled = false;
      if (book) {
        add.textContent = "Читать";
        add.onclick = () => openShelfBook(book);
      } else {
        add.textContent = "Добавить на полку";
      }
    } catch (e) {
      add.disabled = false;
      add.textContent = "Добавить на полку";
      toast(e.message || "Не удалось скачать книгу", 6000);
    }
  };
}
