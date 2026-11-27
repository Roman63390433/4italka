// Полка: список книг, «Продолжить», добавление, удаление, поиск, фильтры по статусам, серии.
import { listBooks, addBook, deleteBook, updateBook, getBook, getFile, getPos, askPersist } from "./storage.js";
import { parseBook, releaseBook } from "./parsers/index.js";
import { ask, toast } from "./sheet.js";
import { STATUSES, statusOf, statusName } from "./status.js";
import { groupSeries } from "./series.js";
import { coverEl, releaseCovers, longPress } from "./covers.js";
import { initSeriesUI, renderSeries, editBookSeries } from "./series-ui.js";
import { isWish, findWishFor, mergeFile } from "./wish.js";
import { initWishUI, showWish } from "./wish-ui.js";

const $ = id => document.getElementById(id);
const FILTER_KEY = "chitalka.shelfFilter";
let openHandler = () => {};
let filter = localStorage.getItem(FILTER_KEY) || "all";
let wishIds = new Set();                 // книги без файла: тап по ним открывает карточку, а не читалку

export function initShelf(onOpen) {
  // проверка синхронная (без await), чтобы читалка открылась прямо «от нажатия» — так браузер разрешает полный экран
  openHandler = id => wishIds.has(id) ? showWish(id) : onOpen(id);
  $("addBtn").onclick = () => $("fileInput").click();
  $("emptyAdd").onclick = () => $("fileInput").click();
  $("fileInput").onchange = e => {
    const files = [...e.target.files];
    e.target.value = "";                 // чтобы тот же файл можно было выбрать ещё раз
    importFiles(files);
  };
  $("search").oninput = () => renderShelf();
  initSeriesUI(renderShelf);
  initWishUI({ importFiles, pickStatus, removeWish });
}

// Добавить файлы книг на полку — общий путь для «+», карточки «хочу» и главной (скачанный с Викитеки File).
// opts.attachTo — id книги «хочу», к которой привязать файл (выбран в её карточке).
// Возвращает карточки добавленных или привязанных книг: [{ id, title, author, …, result: "added" | "attached" }];
// уже бывшие на полке и не разобранные файлы в ответ не попадают (о них сказано подсказкой) — тогда массив пустой.
export async function importFiles(files, opts = {}) {
  const out = [];
  for (const f of files) {
    const book = await importFile(f, opts.attachTo);
    if (book) out.push(book);
  }
  await renderShelf();
  return out;
}

async function importFile(file, attachTo = null) {
  toast(`Добавляю «${file.name}»…`, 10000);
  try {
    const book = await parseBook(file, file.name);
    releaseBook(book);
    const existing = await listBooks();
    const dup = existing.find(b => !isWish(b) && b.title === book.title && b.author === book.author && b.size === file.size);
    if (dup) {
      toast(`«${book.title}» уже на полке`);
      return null;
    }
    // на полке есть такая же книга без файла — файл достаётся ей (статус, серия, заметки сохраняются)
    const wish = attachTo ? existing.find(b => b.id === attachTo && isWish(b)) : findWishFor(existing, book.title, book.author);
    if (wish) {
      const merged = mergeFile(wish, book, file);
      await addBook(merged, file);
      askPersist();
      toast(`Файл добавлен к книге «${wish.title}» — можно читать`, 4000);
      return { ...merged, result: "attached" };
    }
    const card = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
      title: book.title, author: book.author, format: book.format,
      size: file.size, chars: book.chars, cover: book.cover || null,
      series: book.series || null, seriesNo: book.seriesNo ?? null,
      status: "want", statusAt: Date.now(), scanned: 1,
      added: Date.now(), opened: 0,
    };
    await addBook(card, file);
    askPersist();                         // попросить браузер хранить книги надёжно
    toast(`Добавлено: «${book.title}»`);
    return { ...card, result: "added" };
  } catch (e) {
    const msg = e.name === "QuotaExceededError" ? "в телефоне не хватает места" : e.message;
    toast(`Не удалось добавить «${file.name}»: ${msg}`, 6000);
    return null;
  }
}

async function saveBook(b) {
  try { await updateBook(b); return true; }
  catch { toast("Не удалось сохранить изменения"); return false; }
}

const progressText = p => !p ? "новая" : p >= 100 ? "прочитано" : p + "%";

export async function renderShelf() {
  releaseCovers();
  let books = [];
  try { books = await listBooks(); }
  catch { toast("Не удалось прочитать полку из памяти браузера", 5000); }

  books = books.map(b => {
    const percent = getPos(b.id)?.percent || 0;
    return { ...b, percent, st: statusOf(b, percent) };
  });
  books.sort((a, b) => (b.opened || b.added) - (a.opened || a.added));
  wishIds = new Set(books.filter(isWish).map(b => b.id));
  const series = groupSeries(books);

  drawFilters(books, series);
  const showSeries = filter === "series";

  // «Продолжить» — последняя открытая книга со статусом «читаю»
  const cont = books.find(b => b.opened && b.st === "reading" && b.percent < 100);
  const box = $("continue");
  box.hidden = !cont || !(filter === "all" || filter === "reading");
  box.innerHTML = "";
  if (cont && !box.hidden) {
    box.appendChild(coverEl(cont, "big"));
    const info = document.createElement("div");
    info.className = "continue-info";
    info.innerHTML = `<p class="cont-label">Продолжить</p><p class="b-title"></p><p class="b-author"></p>
      <div class="bar"><i></i></div><p class="b-meta"></p><button class="primary">Читать</button>`;
    info.querySelector(".b-title").textContent = cont.title;
    info.querySelector(".b-author").textContent = cont.author;
    info.querySelector(".bar i").style.width = cont.percent + "%";
    info.querySelector(".b-meta").textContent = `Прочитано ${cont.percent}%`;
    info.querySelector("button").onclick = () => openHandler(cont.id);
    box.appendChild(info);
    box.querySelector(".cover").onclick = () => openHandler(cont.id);
  }

  // список с учётом фильтра и поиска
  const q = $("search").value.trim().toLowerCase();
  const match = b => !q || (b.title + " " + b.author + " " + (b.series || "")).toLowerCase().includes(q);
  const list = $("books");
  list.innerHTML = "";
  $("seriesList").hidden = !showSeries;
  list.hidden = showSeries;
  let shown = [];
  if (showSeries) {
    renderSeries($("seriesList"), series.filter(g => !q || g.name.toLowerCase().includes(q) || g.books.some(match)), books, openHandler);
  } else {
    shown = books.filter(b => (filter === "all" || b.st === filter) && match(b));
    for (const b of shown) list.appendChild(bookRow(b, books));
    if (books.length && !shown.length) {
      list.innerHTML = `<li class="muted nothing">${q ? "Ничего не нашлось" : "Здесь пока пусто. Статус меняется долгим нажатием на книгу."}</li>`;
    }
  }

  $("empty").hidden = books.length > 0;
  $("filters").hidden = books.length < 2;
  $("search").parentElement.hidden = books.length < 4;          // поиск нужен, когда книг много
  document.querySelector("#shelf .ornament").hidden = box.hidden || (!shown.length && !showSeries);

  scanOld(books);
}

function bookRow(b, books) {
  const li = document.createElement("li");
  const open = document.createElement("button");
  open.className = "book-open";
  open.appendChild(coverEl(b));
  const text = document.createElement("span");
  text.className = "book-text";
  text.innerHTML = `<span class="b-title"></span><span class="b-author"></span><span class="b-status"></span>`;
  text.children[0].textContent = b.title;
  text.children[1].textContent = b.author || "Автор не указан";
  const bits = [];
  if (filter === "all") bits.push(statusName(b.st));
  if (b.series) bits.push(b.series + (b.seriesNo ? ` · №${b.seriesNo}` : ""));
  text.children[2].textContent = bits.join(" · ");
  text.children[2].dataset.st = b.st;
  open.appendChild(text);
  const pct = document.createElement("span");
  pct.className = "pct";
  if (isWish(b)) { pct.classList.add("no-file"); pct.textContent = "нет файла"; }   // прогресса у неё нет
  else pct.textContent = progressText(b.percent);
  open.appendChild(pct);
  open.onclick = () => openHandler(b.id);
  longPress(open, () => pickStatus(b));

  const more = document.createElement("button");
  more.className = "row-more";
  more.setAttribute("aria-label", "Действия с книгой");
  more.textContent = "⋮";
  more.onclick = () => bookActions(b, books);
  li.append(open, more);
  return li;
}

// чипы-фильтры: Все · Читаю · Хочу · Отложено · Прочитано · Брошено · Серии (пустые не показываем)
function drawFilters(books, series) {
  const box = $("filters");
  const count = id => books.filter(b => b.st === id).length;
  const items = [{ id: "all", text: "Все", n: books.length },
    ...STATUSES.map(s => ({ id: s.id, text: s.chip, n: count(s.id) })),
    { id: "series", text: "Серии", n: series.length }];
  if (!items.some(i => i.id === filter && i.n)) filter = "all";
  box.innerHTML = "";
  for (const it of items) {
    if (!it.n && it.id !== "all") continue;
    const b = document.createElement("button");
    b.className = "fchip" + (it.id === filter ? " on" : "");
    b.innerHTML = `<span></span> <small>${it.n}</small>`;
    b.firstChild.textContent = it.text;
    b.onclick = () => { filter = it.id; localStorage.setItem(FILTER_KEY, filter); renderShelf(); };
    box.appendChild(b);
  }
}

// выбор статуса — долгое нажатие на книгу или «⋮ → Статус»
export async function pickStatus(b) {
  const cur = b.st || statusOf(b, b.percent);
  const choice = await ask(`«${b.title}»`, STATUSES.map(s => ({
    id: s.id, text: (s.id === cur ? "✓ " : "") + s.name, secondary: s.id !== cur,
  })));
  if (!choice || choice === cur) return;
  if (await saveBook({ ...b, status: choice, statusAt: Date.now() })) toast(`«${b.title}»: ${statusName(choice).toLowerCase()}`);
  renderShelf();
}

async function bookActions(b, books) {
  const wish = isWish(b);
  const choice = await ask(`«${b.title}»`, [
    { id: "read", text: wish ? "Подробнее и добавить файл" : "Читать" },
    { id: "status", text: `Статус: ${statusName(b.st).toLowerCase()}…`, secondary: true },
    { id: "series", text: b.series ? `Серия: ${b.series}…` : "Указать серию…", secondary: true },
    { id: "del", text: wish ? "Убрать с полки" : "Удалить с полки", danger: true },
  ]);
  if (choice === "read") openHandler(b.id);
  if (choice === "status") pickStatus(b);
  if (choice === "series") editBookSeries(b, books);
  if (choice === "del") {
    if (wish) return removeWish(b);
    const sure = await ask(`Удалить «${b.title}» из читалки? Файл в «Загрузках» останется. Закладки и заметки книги удалятся.`, [{ id: "yes", text: "Удалить", danger: true }]);
    if (sure === "yes") {
      try { await deleteBook(b.id); toast("Книга удалена"); }
      catch { toast("Не удалось удалить книгу"); }
      renderShelf();
    }
  }
}

// убрать книгу «хочу» (файла нет — удалять нечего, кроме карточки)
export async function removeWish(b) {
  const sure = await ask(`Убрать «${b.title}» из «Хочу прочитать»?`, [{ id: "yes", text: "Убрать", danger: true }]);
  if (sure !== "yes") return false;
  try { await deleteBook(b.id); toast("Книга убрана с полки"); }
  catch { toast("Не удалось убрать книгу"); }
  renderShelf();
  return true;
}

// книги, добавленные до появления серий, один раз перечитываем в фоне, чтобы достать серию из файла
let scanning = false;
async function scanOld(books) {
  if (scanning) return;
  const old = books.filter(b => !b.scanned);
  if (!old.length) return;
  scanning = true;
  let found = false;
  for (const b of old) {
    try {
      const blob = await getFile(b.id);
      const parsed = blob && await parseBook(blob);
      if (parsed) releaseBook(parsed);
      const fresh = await getBook(b.id);              // свежая запись: пока читали файл, статус могли поменять
      if (!fresh) continue;
      const patch = { scanned: 1 };
      if (parsed?.series && !fresh.series) { patch.series = parsed.series; patch.seriesNo = parsed.seriesNo ?? null; found = true; }
      await updateBook({ ...fresh, ...patch });
    } catch { /* файл не читается — оставим как есть, попробуем в другой раз */ }
  }
  scanning = false;
  if (found) renderShelf();
}
