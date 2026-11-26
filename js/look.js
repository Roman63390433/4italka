// Оформление: применяет настройки к странице и рисует их переключатели
// (панель «Aa» в читалке и выбор стиля на экране «Ещё»).
// Настройки бывают общие и «только для этой книги» — тогда отличия хранятся отдельно (settings.loadBook/saveBook).
import * as S from "./settings.js";
import { nextFrame } from "./view.js";

const $ = id => document.getElementById(id);
let s = S.load();          // общие настройки
let bookId = null;         // открытая книга
let o = null;              // её личные настройки (или null — книга живёт по общим)
let hooks = { relayout() {}, mode() {} };

export const current = () => S.effective(s, o);

// hooks.relayout — текст надо разложить заново; hooks.mode(mode) — сменился режим «страницы / лента»
export function initLook(h) {
  hooks = { ...hooks, ...h };
  apply();
  bind();
  draw();
}

// книга открыта / закрыта — подхватываем её личные настройки
export function setBookLook(id) {
  bookId = id;
  o = id ? S.loadBook(id) : null;
  apply();
  draw();
}

// relayout: false — когда меняется только цвет (раскладка текста та же)
function set(patch, { relayout = true } = {}) {
  const before = current();
  if (o) {
    for (const k of S.BOOK_KEYS) if (k in patch) { o[k] = patch[k]; delete patch[k]; }
    S.saveBook(bookId, o);
  }
  s = { ...s, ...patch };
  S.save(s);
  apply();
  draw();
  const now = current();
  if (now.mode !== before.mode) hooks.mode(now.mode);
  else if (relayout) scheduleRelayout();
}

// пока тянут ползунок, раскладываем текст не чаще раза за кадр
let raf = false;
function scheduleRelayout() {
  if (raf) return;
  raf = true;
  nextFrame(() => { raf = false; hooks.relayout(); });
}

function apply() {
  const e = current();
  const root = document.documentElement;
  root.dataset.style = e.style;
  const r = $("reader");
  r.dataset.page = e.page;
  r.dataset.mode = e.mode;
  r.dataset.align = e.align;
  r.style.setProperty("--read", S.fontCss(e.font));
  r.style.setProperty("--read-size", e.size + "px");
  r.style.setProperty("--read-lh", e.lh);
  r.style.setProperty("--margin", e.margin + "px");
  $("dimmer").style.opacity = e.dim;
  document.querySelector('meta[name="theme-color"]').content = BAR[e.style];
}

// цвет полосы браузера сверху под стиль
const BAR = { calm: "#121212", vintage: "#efe6d5", autumn: "#1a1411" };

function range(id, [min, max, step], key, fmt) {
  const el = $(id);
  Object.assign(el, { min, max, step });
  el.oninput = () => set({ [key]: Number(el.value) });
  el._fmt = fmt;
}

// кнопки создаём один раз, потом только переключаем «выбрано»
function bind() {
  document.querySelectorAll('[data-role="styles"]').forEach(box => {
    for (const st of S.STYLES) {
      const b = document.createElement("button");
      b.textContent = st.name;
      b.dataset.id = st.id;
      b.onclick = () => set(S.withStyle(current(), st.id));
      box.appendChild(b);
    }
  });
  for (const p of S.PAGES) {
    const b = document.createElement("button");
    b.className = "chip t-" + p.id;
    b.textContent = p.name;
    b.dataset.id = p.id;
    b.onclick = () => set({ page: p.id }, { relayout: false });
    $("pageChips").appendChild(b);
  }
  for (const f of S.FONTS) {
    const b = document.createElement("button");
    b.textContent = f.id;
    b.dataset.id = f.id;
    b.style.fontFamily = f.css;
    b.onclick = () => set({ font: f.id });
    $("fontChips").appendChild(b);
  }
  range("sizeRange", S.SIZE, "size", v => v);
  range("lhRange", S.LH, "lh", v => v.toFixed(2).replace(".", ","));
  range("marginRange", S.MARGIN, "margin", v => v);
  const seg = (box, items, key) => items.forEach(it => {
    const b = document.createElement("button");
    b.dataset.id = it.id;
    b.textContent = it.name;
    b.onclick = () => set({ [key]: it.id });
    $(box).appendChild(b);
  });
  seg("alignSeg", S.ALIGNS, "align");
  seg("modeSeg", S.MODES, "mode");
  $("dimRange").oninput = e => set({ dim: e.target.value / 100 }, { relayout: false });
  $("bookOnly").onchange = e => {
    if (!bookId) return;
    if (e.target.checked) {               // начинаем с того, что сейчас на экране
      const e2 = current();
      o = Object.fromEntries(S.BOOK_KEYS.map(k => [k, e2[k]]));
      S.saveBook(bookId, o);
    } else {                              // книга снова живёт по общим настройкам
      o = null;
      S.saveBook(bookId, null);
    }
    apply(); draw(); scheduleRelayout();
  };
}

function draw() {
  const e = current();
  const on = (sel, val) => document.querySelectorAll(sel).forEach(b => b.classList.toggle("on", b.dataset.id === val));
  on('[data-role="styles"] button', e.style);
  on("#pageChips button", e.page);
  on("#fontChips button", e.font);
  on("#alignSeg button", e.align);
  on("#modeSeg button", e.mode);
  for (const [id, out, v] of [["sizeRange", "sizeVal", e.size], ["lhRange", "lhVal", e.lh], ["marginRange", "marginVal", e.margin]]) {
    $(id).value = v;
    $(out).textContent = $(id)._fmt(v);
  }
  $("dimRange").value = Math.round(e.dim * 100);
  $("dimVal").textContent = Math.round(e.dim * 100) + "%";
  $("bookOnlyRow").hidden = !bookId;
  $("bookOnly").checked = !!o;
  $("bookOnlyHint").textContent = o ? "У этой книги свои шрифт, размер, интервал, поля и выравнивание"
    : "Шрифт, размер, интервал, поля и выравнивание";
  if ($("fsToggle")) $("fsToggle").checked = e.fullscreen;
}

// «Во весь экран при чтении» — переключатель на экране «Ещё»
export function setFullscreenPref(on) { set({ fullscreen: on }, { relayout: false }); }
