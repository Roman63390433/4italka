// Серии на полке: карточки «прочитано 3 из 7 · следующая — №4 · Продолжить» с лентой книг по номерам
// (пропущенные номера подсвечены) и окно ручной правки серии. Правила — в series.js.
import { saveTotal, loadTotals, seriesKey, seriesNames } from "./series.js";
import { statusOf } from "./status.js";
import { updateBook } from "./storage.js";
import { openSheet, closeSheet, toast } from "./sheet.js";
import { coverEl } from "./covers.js";

const $ = id => document.getElementById(id);
let rerender = () => {};
let editing = null;       // { mode: "book", book } или { mode: "series", group }

export function initSeriesUI(onChange) {
  rerender = onChange;
  $("ssSave").onclick = save;
  $("ssClear").onclick = clearBook;
}

const noText = n => Number.isInteger(n) ? String(n) : String(n).replace(".", ",");

export function renderSeries(box, groups, books, open) {
  box.innerHTML = "";
  if (!groups.length) {
    box.innerHTML = '<p class="muted nothing">Серий пока нет. Серия берётся из файла книги или указывается вручную: «⋮» у книги → «Указать серию».</p>';
    return;
  }
  for (const g of groups) box.appendChild(card(g, books, open));
}

function card(g, books, open) {
  const el = document.createElement("article");
  el.className = "series-card";
  el.innerHTML = `<div class="sc-head"><h2 class="sc-name"></h2><button class="row-more" aria-label="Изменить серию">⋮</button></div>
    <p class="sc-meta"></p><p class="sc-next"></p><div class="sc-strip"></div>`;
  el.querySelector(".sc-name").textContent = g.name;
  el.querySelector(".row-more").onclick = () => editSeries(g);
  el.querySelector(".sc-meta").textContent = `Прочитано ${g.done} из ${g.total}`;
  const next = el.querySelector(".sc-next");
  if (!g.next) next.textContent = "Серия прочитана";
  else if (g.next.book) next.textContent = (g.next.no ? `Следующая — №${g.next.no}: ` : "Следующая: ") + g.next.book.title;
  else { next.textContent = `Следующая — №${g.next.no}, её нет на полке`; next.classList.add("warn"); }

  // лента: книги по номерам, на месте пропущенных номеров — пустые плитки
  const strip = el.querySelector(".sc-strip");
  const items = [...g.books.map(b => ({ no: b.seriesNo, book: b })), ...g.missing.map(no => ({ no, book: null }))]
    .sort((a, b) => (a.no ?? 1e9) - (b.no ?? 1e9));
  for (const it of items) {
    const t = document.createElement(it.book ? "button" : "div");
    t.className = "tile" + (it.book ? "" : " missing");
    if (it.book) {
      t.appendChild(coverEl(it.book, "small"));
      const done = statusOf(it.book, it.book.percent) === "done";
      if (done) t.classList.add("done");
      t.setAttribute("aria-label", `${it.book.title}${done ? ", прочитано" : ""}`);
      t.onclick = () => open(it.book.id);
    } else {
      const ph = document.createElement("span");
      ph.className = "ph";
      ph.textContent = "нет";
      t.appendChild(ph);
      t.title = `Книги №${it.no} нет на полке`;
    }
    const n = document.createElement("span");
    n.className = "tile-no";
    n.textContent = it.no ? "№" + noText(it.no) : "—";
    t.appendChild(n);
    strip.appendChild(t);
  }
  if (g.missing.length) {
    const p = document.createElement("p");
    p.className = "sc-missing";
    p.textContent = "Нет на полке: №" + g.missing.join(", №");
    el.appendChild(p);
  }
  if (g.cont) {
    const b = document.createElement("button");
    b.className = "primary";
    b.textContent = statusOf(g.cont, g.cont.percent) === "reading" ? `Продолжить: ${g.cont.title}` : `Начать: ${g.cont.title}`;
    b.onclick = () => open(g.cont.id);
    el.appendChild(b);
  }
  return el;
}

// ---- окно правки: у книги (название, номер, всего) или у серии целиком (название, всего) ----
function fillNames(books) {
  $("ssNames").innerHTML = "";
  for (const n of seriesNames(books)) {
    const o = document.createElement("option");
    o.value = n;
    $("ssNames").appendChild(o);
  }
}

export function editBookSeries(book, books) {
  editing = { mode: "book", book };
  fillNames(books);
  $("ssTitle").textContent = "Серия книги";
  $("ssName").value = book.series || "";
  $("ssNo").value = book.seriesNo ?? "";
  $("ssNoBox").hidden = false;
  $("ssTotal").value = loadTotals()[seriesKey(book.series)]?.total || "";
  $("ssTotal").dataset.was = $("ssTotal").value;
  $("ssClear").hidden = !book.series;
  openSheet("seriesSheet");
}

function editSeries(g) {
  editing = { mode: "series", group: g };
  $("ssNames").innerHTML = "";
  $("ssTitle").textContent = "Серия";
  $("ssName").value = g.name;
  $("ssNoBox").hidden = true;
  $("ssTotal").value = g.manualTotal || "";
  $("ssTotal").dataset.was = $("ssTotal").value;
  $("ssClear").hidden = true;
  openSheet("seriesSheet");
}

const num = v => { const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };

async function save() {
  const name = $("ssName").value.replace(/\s+/g, " ").trim();
  const total = num($("ssTotal").value);
  try {
    if (editing?.mode === "book") {
      const b = editing.book;
      await updateBook({ ...b, series: name || null, seriesNo: name ? num($("ssNo").value) : null });
      // «всего» меняем, только если поле правили, — иначе не затираем то, что задано у серии раньше
      if (name && $("ssTotal").value.trim() !== $("ssTotal").dataset.was) saveTotal(name, total || 0);
    } else if (editing?.mode === "series") {
      const g = editing.group;
      if (!name) { toast("Введите название серии"); return; }
      if (seriesKey(name) !== g.key) {                  // переименовали — меняем у всех книг серии
        for (const b of g.books) await updateBook({ ...b, series: name });
        saveTotal(g.name, 0);
      }
      saveTotal(name, total || 0);
    }
    toast("Серия сохранена", 1800);
  } catch { toast("Не удалось сохранить серию"); }
  editing = null;
  await closeSheet();
  rerender();
}

async function clearBook() {
  if (editing?.mode !== "book") return;
  try { await updateBook({ ...editing.book, series: null, seriesNo: null }); toast("Книга убрана из серии", 1800); }
  catch { toast("Не удалось сохранить"); }
  editing = null;
  await closeSheet();
  rerender();
}
