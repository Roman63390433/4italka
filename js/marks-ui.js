// Закладки и заметки на экране чтения: кнопка-закладка, риски на полосе прогресса, шторка со списками,
// полоска цветов при выделении текста, окно заметки, подсветка в тексте, выгрузка в файл.
// Логика (создание, поиск, группировка, текст файла) — в marks.js; здесь только кнопки и показ.
import * as M from "./marks.js";
import { wrapRange, unwrap, TextIndex } from "./anchor.js";
import { openSheet, closeSheet, toast } from "./sheet.js";

const $ = id => document.getElementById(id);
let marks = [];               // все закладки и заметки открытой книги
let bookId = null, bookMeta = null;
let hooks = { view: () => null, goTo() {}, closeMenu() {} };
let tab = "bookmark";

// view() — текущий режим чтения; goTo(ch, off) — перейти; closeMenu() — спрятать меню читалки
export function initMarks(h) {
  hooks = { ...hooks, ...h };
  bind();
}

export async function openMarks(id, book) {
  bookId = id;
  bookMeta = { title: book.title, author: book.author };
  marks = await M.load(id);
}

export function closeMarks() {
  bookId = null; marks = [];
  hideSelBar();
}

// ---- подсветка заметок в тексте главы (вызывается режимом чтения до подсчёта букв) ----
export function decorate(root, ch) {
  for (const m of M.notesOf(marks, ch)) {
    wrapRange(new TextIndex(root), m.start, m.end, () => {
      const el = document.createElement("mark");
      el.className = "hl c-" + m.color;
      el.dataset.id = m.id;
      return el;
    });
  }
}

// перерисовать подсветку главы ch, если она на экране
function refresh(ch) {
  const v = hooks.view(), root = v?.rootOf(ch);
  if (!root) return;
  unwrap(root, "mark.hl");
  decorate(root, ch);
  v.reindex(ch);
}

// ---- закладка на текущей странице ----
function bookmarksShown() {
  const v = hooks.view();
  if (!v?.book) return [];
  const r = v.shownRange();
  return marks.filter(m => m.type === "bookmark" && m.ch === r.ch && m.start >= r.start && (m.start < r.end || m.start === r.start));
}

// вызывается при каждой смене страницы
export function onPage() {
  const on = bookmarksShown().length > 0;
  $("bmBtn").classList.toggle("on", on);
  $("bmBtn").setAttribute("aria-pressed", on);
  $("ribbon").hidden = !on;
  hideSelBar();
}

async function toggleBookmark() {
  const v = hooks.view();
  if (!v?.book) return;
  const here = bookmarksShown();
  if (here.length) {
    for (const m of here) await M.remove(m.id).catch(() => {});
    marks = marks.filter(m => !here.includes(m));
    toast("Закладка снята", 3000, { text: "Вернуть", fn: () => restore(here) });
  } else {
    const r = v.shownRange(), idx = v.indexOf(r.ch);
    const m = M.makeBookmark(bookId, {
      ch: r.ch, off: r.start, quote: idx ? idx.text(r.start, Math.min(idx.total, r.start + 160)) : "",
      frac: v.bookFrac(r.ch, r.start, idx?.total || 0), chapterTitle: v.book.chapters[r.ch].title,
    });
    try { await M.save(m); marks.push(m); marks.sort(M.byPlace); toast("Закладка поставлена", 1800); }
    catch { toast("Не удалось сохранить закладку"); }
  }
  drawTicks();
  onPage();
}

async function restore(list) {
  for (const m of list) { await M.save(m).catch(() => {}); marks.push(m); }
  marks.sort(M.byPlace);
  new Set(list.map(m => m.ch)).forEach(refresh);
  drawTicks(); onPage();
  if (!$("marksSheet").hidden) drawList();
}

// ---- риски закладок на полосе прогресса ----
export function drawTicks() {
  $("ticks").innerHTML = marks.filter(m => m.type === "bookmark")
    .map(m => `<i style="left:calc(9px + (100% - 18px) * ${Math.min(1, Math.max(0, m.frac || 0)).toFixed(4)})"></i>`).join("");
}

// ---- шторка «Закладки / Заметки» ----
function openList() {
  $("notesSearch").value = "";
  drawList();
  openSheet("marksSheet");
}

function drawList() {
  document.querySelectorAll("#marksTabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  const isNotes = tab === "note";
  const all = marks.filter(m => m.type === tab);
  $("notesSearchBox").hidden = !isNotes || all.length < 4;
  $("exportBtn").hidden = !isNotes || !all.length;
  const list = $("marksList");
  list.innerHTML = "";
  if (!all.length) {
    list.innerHTML = `<p class="muted marks-empty">${isNotes
      ? "Заметок пока нет. Выделите текст в книге — появятся цвета и кнопка «Заметка»."
      : "Закладок пока нет. Откройте меню и нажмите значок закладки вверху — она встанет на текущую страницу."}</p>`;
    return;
  }
  if (!isNotes) {
    const ul = document.createElement("ul");
    ul.className = "marks";
    for (const m of all) ul.appendChild(row(m));
    list.appendChild(ul);
    return;
  }
  const shown = M.search(all, $("notesSearch").value);
  if (!shown.length) { list.innerHTML = '<p class="muted marks-empty">Ничего не нашлось</p>'; return; }
  for (const g of M.groupByChapter(shown)) {
    const h = document.createElement("h3");
    h.className = "marks-ch";
    h.textContent = g.title;
    const ul = document.createElement("ul");
    ul.className = "marks";
    for (const m of g.items) ul.appendChild(row(m));
    list.append(h, ul);
  }
}

// строка списка: тап — перейти, свайп влево — удалить
function row(m) {
  const li = document.createElement("li");
  const b = document.createElement("button");
  b.className = "mark-row" + (m.type === "note" ? " is-note c-" + m.color : "");
  if (m.type === "bookmark") {
    b.innerHTML = `<span class="mr-meta"></span><span class="mr-quote"></span>`;
    b.firstChild.textContent = `${Math.round((m.frac || 0) * 100)}% · ${m.chapterTitle || ""}`;
    b.lastChild.textContent = m.quote + "…";
  } else {
    b.innerHTML = `<span class="mr-quote"></span>${m.note ? '<span class="mr-note"></span>' : ""}<span class="mr-meta"></span>`;
    b.querySelector(".mr-quote").textContent = m.quote;
    if (m.note) b.querySelector(".mr-note").textContent = m.note;
    b.querySelector(".mr-meta").textContent = new Date(m.created).toLocaleDateString("ru-RU");
  }
  b.onclick = async () => {
    if (b._swiped) return;
    await closeSheet();
    hooks.closeMenu();
    hooks.goTo(m.ch, m.start);
  };
  swipeToDelete(li, b, () => removeMarks([m]));
  li.appendChild(b);
  return li;
}

function swipeToDelete(li, el, onDelete) {
  let x0 = null, y0 = 0, dx = 0, horiz = null;
  el.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; horiz = null; el.style.transition = "none"; }, { passive: true });
  el.addEventListener("touchmove", e => {
    if (x0 === null) return;
    dx = e.touches[0].clientX - x0;
    const dy = e.touches[0].clientY - y0;
    if (horiz === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) horiz = Math.abs(dx) > Math.abs(dy);
    if (horiz) el.style.transform = `translateX(${Math.min(0, dx)}px)`;
  }, { passive: true });
  el.addEventListener("touchend", () => {
    el.style.transition = "";
    if (horiz && dx < -90) {
      el._swiped = true;
      el.style.transform = "translateX(-110%)";
      li.classList.add("gone");
      setTimeout(onDelete, 180);
    } else {
      el.style.transform = "";
      if (horiz) { el._swiped = true; setTimeout(() => { el._swiped = false; }, 300); }
    }
    x0 = null;
  });
}

async function removeMarks(list) {
  for (const m of list) await M.remove(m.id).catch(() => {});
  marks = marks.filter(m => !list.includes(m));
  new Set(list.map(m => m.ch)).forEach(refresh);
  drawTicks(); onPage(); drawList();
  const what = list[0].type === "note" ? "Заметка удалена" : "Закладка удалена";
  toast(what, 4000, { text: "Вернуть", fn: () => restore(list) });
}

// ---- выгрузка заметок в файл ----
async function exportNotes() {
  const text = "﻿" + M.exportText(bookMeta, marks);       // ﻿ — чтобы «Блокнот» Windows понял кириллицу
  const file = new File([text], M.exportName(bookMeta), { type: "text/plain" });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: file.name });
      return;
    }
  } catch (e) {
    if (e.name === "AbortError") return;                      // передумали — ничего страшного
  }
  // запасной путь: обычное скачивание
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast("Файл сохранён в «Загрузки»");
}

// ---- выделение текста → цвет или заметка ----
let pending = null;            // выделенный отрывок, ещё не сохранённый

function selectionPlace() {
  const sel = document.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  const v = hooks.view();
  if (!v?.book || !$("flow").contains(range.commonAncestorContainer)) return null;
  const startEl = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
  const sec = startEl.closest("section.chap");
  const ch = sec ? +sec.dataset.ch : v.ch;
  const idx = v.indexOf(ch);
  if (!idx) return null;
  const start = idx.offsetOf(range.startContainer, range.startOffset);
  const root = v.rootOf(ch);
  const end = root.contains(range.endContainer) ? idx.offsetOf(range.endContainer, range.endOffset) : idx.total;
  const quote = idx.text(start, end);
  if (end <= start || !quote) return null;
  return { ch, start, end, quote, frac: v.bookFrac(ch, start, idx.total), chapterTitle: v.book.chapters[ch].title, rect: range.getBoundingClientRect() };
}

let selTimer;
function onSelection() {
  clearTimeout(selTimer);
  selTimer = setTimeout(() => {
    const p = bookId && selectionPlace();
    if (!p) { hideSelBar(); return; }
    pending = p;
    const bar = $("selBar");
    bar.hidden = false;
    const h = bar.offsetHeight, w = bar.offsetWidth, vh = window.innerHeight;
    // под выделением (сверху Android показывает своё меню «Копировать»); если не влезает — над ним
    let top = p.rect.bottom + 14;
    if (top + h > vh - 70) top = Math.max(12, p.rect.top - h - 64);
    const left = Math.min(window.innerWidth - w - 10, Math.max(10, p.rect.left + p.rect.width / 2 - w / 2));
    bar.style.top = top + "px";
    bar.style.left = left + "px";
  }, 220);
}

function hideSelBar() { $("selBar").hidden = true; }

async function saveNew(color, note) {
  const m = M.makeNote(bookId, pending, color, note);
  pending = null;
  document.getSelection().removeAllRanges();
  hideSelBar();
  try { await M.save(m); }
  catch { toast("Не удалось сохранить заметку"); return null; }
  marks.push(m); marks.sort(M.byPlace);
  refresh(m.ch);
  return m;
}

// ---- окно заметки: новая или уже сохранённая ----
let editing = null, editColor = "yellow";

function openEditor(m) {
  editing = m;                         // m — сохранённая заметка или null (новая из выделения)
  const quote = m ? m.quote : pending?.quote;
  if (!quote) return;
  editColor = m ? m.color : "yellow";
  $("neQuote").textContent = quote;
  $("neText").value = m ? m.note : "";
  $("neDel").hidden = !m;
  drawEditorColors();
  hideSelBar();
  openSheet("noteEditSheet");
  setTimeout(() => $("neText").focus(), 250);
}

function drawEditorColors() {
  document.querySelectorAll("#neColors button").forEach(b => b.classList.toggle("on", b.dataset.id === editColor));
}

async function saveEditor() {
  const text = $("neText").value.trim();
  if (editing) {
    editing.note = text;
    editing.color = editColor;
    try { await M.save(editing); } catch { toast("Не удалось сохранить заметку"); }
    refresh(editing.ch);
    toast("Заметка сохранена", 1800);
  } else if (pending) {
    if (await saveNew(editColor, text)) toast("Заметка сохранена", 1800);
  }
  editing = null;
  closeSheet();
}

// тап по подсветке в тексте — открыть её заметку. true — тап «съеден»
export function tapOnMark(target) {
  const el = target.closest?.("mark.hl");
  if (!el) return false;
  const m = marks.find(x => x.id === el.dataset.id);
  if (!m) return false;
  openEditor(m);
  return true;
}

function colorButtons(box, onPick) {
  for (const c of M.COLORS) {
    const b = document.createElement("button");
    b.className = "dot c-" + c.id;
    b.dataset.id = c.id;
    b.setAttribute("aria-label", c.name);
    b.onclick = () => onPick(c.id);
    $(box).appendChild(b);
  }
}

function bind() {
  $("bmBtn").onclick = toggleBookmark;
  $("marksBtn").onclick = openList;
  document.querySelectorAll("#marksTabs button").forEach(b => b.onclick = () => { tab = b.dataset.tab; drawList(); });
  $("notesSearch").oninput = drawList;
  $("exportBtn").onclick = exportNotes;
  colorButtons("selColors", async color => { if (pending && await saveNew(color, "")) toast("Выделено. Тап по выделению — добавить заметку", 2500); });
  colorButtons("neColors", color => { editColor = color; drawEditorColors(); });
  $("selNote").onclick = () => openEditor(null);
  $("neSave").onclick = saveEditor;
  $("neDel").onclick = async () => {
    const m = editing;
    editing = null;
    await closeSheet();
    if (m) removeMarks([m]);
  };
  document.addEventListener("selectionchange", onSelection);
  // полоска не должна мешать прокрутке ленты
  $("viewport").addEventListener("scroll", () => { if (!$("selBar").hidden) onSelection(); }, { passive: true });
}
