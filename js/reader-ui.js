// Экран чтения: открывает книгу, листает касаниями и свайпами, показывает меню, оглавление, сноски.
import { getFile, getPos, savePos, getBook, updateBook } from "./storage.js";
import { parseBook, releaseBook } from "./parsers/index.js";
import { Paginator } from "./paginator.js";
import { Scroller } from "./scroller.js";
import { openSheet, closeSheet, pushLayer, back, toast } from "./sheet.js";
import { current as look, setBookLook } from "./look.js";

const $ = id => document.getElementById(id);
const reader = $("reader"), viewport = $("viewport"), flow = $("flow");

let book = null, bookId = null, wakeLock = null, onClosed = null;
// два режима чтения с одинаковыми командами; pag — тот, что включён сейчас
const views = { pages: new Paginator(viewport, flow, render), scroll: new Scroller(viewport, flow, render) };
let pag = views.pages;

function render(st) {
  if (!book) return;
  $("pagenum").textContent = look().mode === "scroll" ? `${st.percent}%` : `${st.bookPage} из ${st.bookPages}`;
  $("rChapter").textContent = "☰ " + st.chapterTitle;
  $("rLeft").textContent = st.left ? `ещё ${st.left} стр` : "последняя стр главы";
  $("rPercent").textContent = `${st.percent}% от всей книги`;
  $("rSlider").value = Math.round(st.frac * 1000);
  savePos(bookId, { ch: st.ch, off: st.off, percent: st.percent });
}

// сменить режим «страницы / лента», оставшись на той же букве
export function switchMode(mode) {
  const next = views[mode] || views.pages;
  if (next === pag) return;
  const at = book ? pag.anchor() : null;
  pag.detach();
  pag = next;
  pag.attach();
  if (book) { pag.setBook(book); pag.show(at.ch, { off: at.off }); }
}

export async function openBook(id, closedCallback) {
  onClosed = closedCallback;
  enterFullscreen();                                  // только по нажатию пользователя — браузер так требует
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
    setBookLook(id);                                  // у книги могут быть свои шрифт и размер
    pag.detach();
    pag = views[look().mode] || views.pages;
    pag.attach();
    await document.fonts.ready;                       // страницы считаем, когда шрифт загружен
    pag.setBook(book);
    const pos = getPos(id) || { ch: 0, off: 0 };      // старые позиции хранили frac — show понимает и их
    pag.show(pos.ch, { off: pos.off, frac: pos.frac });
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
  pag.detach();
  setBookLook(null);
  exitFullscreen();
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

// ---- во весь экран: прячем часы и системные кнопки, пока читаем (реже срабатывают системные жесты) ----
function enterFullscreen() {
  if (!look().fullscreen || document.fullscreenElement) return;
  document.documentElement.requestFullscreen?.({ navigationUI: "hide" }).catch(() => {});
}
function exitFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

// ---- меню ----
function setMenu(on) { reader.classList.toggle("menu-open", on); }
const menuOpen = () => reader.classList.contains("menu-open");

// ---- касания: левая треть — назад, правая — вперёд, середина — меню; свайп влево/вправо — листать;
//      свайп вверх из середины экрана — меню (у самого низа экрана — системный жест, его не трогаем) ----
const EDGE = 56;                                     // нижняя полоса, где касания не считаются
let touch = null, swiped = false;
const scrollMode = () => look().mode === "scroll";
const hasSelection = () => !document.getSelection().isCollapsed;

viewport.addEventListener("touchstart", e => {
  const t = e.touches[0];
  touch = e.touches.length === 1 && t.clientY < window.innerHeight - EDGE ? { x: t.clientX, y: t.clientY } : null;
}, { passive: true });
viewport.addEventListener("touchend", e => {
  if (!touch || !book || hasSelection()) { touch = null; return; }
  const dx = e.changedTouches[0].clientX - touch.x, dy = e.changedTouches[0].clientY - touch.y;
  const y0 = touch.y / window.innerHeight;
  touch = null;
  const mark = () => { swiped = true; setTimeout(() => { swiped = false; }, 400); };   // после свайпа «клик» не нужен
  if (!scrollMode() && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
    mark();
    if (menuOpen()) setMenu(false);
    else dx < 0 ? turn(1) : turn(-1);
  } else if (!scrollMode() && dy < -70 && Math.abs(dy) > Math.abs(dx) * 1.5 && y0 > 0.3 && y0 < 0.8) {
    mark();
    setMenu(true);
  }
});

viewport.addEventListener("click", e => {
  if (swiped) { swiped = false; return; }
  if (!book || hasSelection()) return;
  if (e.clientY > window.innerHeight - EDGE) return;   // у нижнего края — ничего, чтобы не спорить с системой
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
    b.onclick = () => { pag.show(i, { off: 0 }); closeSheet(); setMenu(false); };
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
