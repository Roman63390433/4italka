// Экран чтения: открывает книгу, листает касаниями и свайпами, показывает меню, оглавление, сноски.
import { getFile, getPos, savePos, getBook, updateBook } from "./storage.js";
import { parseBook, releaseBook } from "./parsers/index.js";
import { Paginator } from "./paginator.js";
import { openSheet, closeSheet, pushLayer, back, toast } from "./sheet.js";

const $ = id => document.getElementById(id);
const reader = $("reader"), viewport = $("viewport"), flow = $("flow");

let book = null, bookId = null, wakeLock = null, onClosed = null;
const pag = new Paginator(viewport, flow, render);

function render(st) {
  $("pagenum").textContent = `${st.bookPage} из ${st.bookPages}`;
  $("rChapter").textContent = "☰ " + st.chapterTitle;
  $("rLeft").textContent = st.left ? `ещё ${st.left} стр` : "последняя стр главы";
  $("rPercent").textContent = `${st.percent}% от всей книги`;
  $("rSlider").value = Math.round((pag.before[st.ch] + book.chapters[st.ch].chars * st.frac) / book.chars * 1000);
  savePos(bookId, { ch: st.ch, frac: st.frac, percent: st.percent });
}

export async function openBook(id, closedCallback) {
  onClosed = closedCallback;
  reader.hidden = false;
  document.body.classList.add("reading");
  setMenu(false);
  flow.innerHTML = '<p class="loading">Открываю книгу…</p>';
  pushLayer("reader", closeNow);

  try {
    const blob = await getFile(id);
    if (!blob) throw new Error("Файл книги не найден в памяти телефона");
    const meta = await getBook(id);
    book = await parseBook(blob);
    bookId = id;
    $("rTitle").textContent = book.title;
    $("rAuthor").textContent = book.author;
    if (meta) updateBook({ ...meta, opened: Date.now() });
    await document.fonts.ready;                       // страницы считаем, когда шрифт загружен
    pag.setBook(book);
    const pos = getPos(id) || { ch: 0, frac: 0 };
    pag.show(pos.ch, pos.frac);
    keepAwake();
  } catch (e) {
    flow.innerHTML = "";
    toast("Не удалось открыть книгу: " + e.message, 5000);
    back();
  }
}

function closeNow() {
  reader.hidden = true;
  document.body.classList.remove("reading");
  releaseBook(book);
  book = null;
  flow.innerHTML = "";
  wakeLock?.release().catch(() => {});
  wakeLock = null;
  onClosed?.();
}

// экран не гаснет, пока читаем (Chrome на Android)
async function keepAwake() {
  try { wakeLock = await navigator.wakeLock?.request("screen"); } catch { /* не поддерживается — ничего страшного */ }
}
document.addEventListener("visibilitychange", () => { if (book && document.visibilityState === "visible") keepAwake(); });

export function relayout() { if (book) pag.relayout(); }

// ---- меню ----
function setMenu(on) { reader.classList.toggle("menu-open", on); }
const menuOpen = () => reader.classList.contains("menu-open");

// ---- касания: левая треть — назад, правая — вперёд, середина — меню; свайп влево/вправо ----
let touch = null, swiped = false;
viewport.addEventListener("touchstart", e => { touch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
viewport.addEventListener("touchend", e => {
  if (!touch || !book) return;
  const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
  touch = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
    swiped = true;
    setTimeout(() => { swiped = false; }, 400);   // после свайпа «клик» не нужен
    if (menuOpen()) setMenu(false);
    else dx < 0 ? turn(1) : turn(-1);
  }
});

viewport.addEventListener("click", e => {
  if (swiped) { swiped = false; return; }
  if (!book) return;
  const note = e.target.closest(".note");
  if (note && book.notes.has(note.dataset.note)) {
    $("noteBody").innerHTML = book.notes.get(note.dataset.note);   // HTML сносок собран нами в fb2.js
    openSheet("noteSheet");
    return;
  }
  if (menuOpen()) { setMenu(false); return; }
  const x = e.clientX / window.innerWidth;
  if (x < 1 / 3) turn(-1);
  else if (x > 2 / 3) turn(1);
  else setMenu(true);
});

function turn(dir) {
  const ok = dir > 0 ? pag.next() : pag.prev();
  if (!ok) toast(dir > 0 ? "Это конец книги" : "Это начало книги", 1500);
}

// клавиатура — для проверки на компьютере
document.addEventListener("keydown", e => {
  if (!book || reader.hidden || document.querySelector(".sheet.open")) return;
  if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); turn(1); }
  if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); turn(-1); }
});

$("backBtn").onclick = () => back();
$("rSlider").addEventListener("change", e => pag.goToPercent(e.target.value / 1000));
$("lookBtn").onclick = () => openSheet("lookSheet");

$("tocBtn").onclick = () => {
  const list = $("toc");
  list.innerHTML = "";
  book.chapters.forEach((c, i) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.textContent = c.title;
    if (i === pag.ch) b.className = "on";
    b.onclick = () => { pag.show(i, 0); closeSheet(); setMenu(false); };
    li.appendChild(b);
    list.appendChild(li);
  });
  openSheet("tocSheet");
  list.querySelector(".on")?.scrollIntoView({ block: "center" });
};

// ⋮ — сведения о книге
$("bookMenuBtn").onclick = () => {
  const st = pag.state();
  toast(`${book.title}. Глав: ${book.chapters.length}. Прочитано ${st.percent}%.`, 4000);
};
