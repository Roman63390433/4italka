// Карточка книги «хочу прочитать» (без файла): описание, «Где взять», «Добавить файл», «Убрать с полки».
// Панель создаётся здесь же, из кода (в index.html её нет). Правила — в wish.js.
import { getBook } from "./storage.js";
import { openSheet, closeSheet, toast } from "./sheet.js";
import { statusOf, statusName } from "./status.js";
import { coverEl } from "./covers.js";
import { litresUrl } from "./wish.js";

let api = {};             // { importFiles, pickStatus, removeWish } — из полки
let sheet, current = null;

const SRC = { fantlab: "на FantLab", wikisource: "в Викитеке" };

export function initWishUI(fns) {
  api = fns;
  sheet = document.createElement("div");
  sheet.className = "sheet wish-sheet";
  sheet.id = "wishSheet";
  sheet.hidden = true;
  sheet.innerHTML = `<div class="grip"></div>
    <div class="ws-head"><div class="ws-cover"></div>
      <div class="ws-info"><h2 class="sheet-title ws-title"></h2><p class="ws-author"></p><p class="ws-meta"></p>
        <span class="ws-nofile">нет файла</span></div></div>
    <button class="ws-status secondary"></button>
    <p class="ws-genres"></p>
    <div class="ws-desc"></div>
    <a class="ws-source" target="_blank" rel="noopener noreferrer"></a>
    <div class="ws-btns">
      <button class="primary ws-add">Добавить файл</button>
      <a class="secondary ws-where" target="_blank" rel="noopener noreferrer">Где взять</a>
      <button class="danger ws-del">Убрать с полки</button>
    </div>
    <p class="ws-hint">«Где взять» ищет книгу на Литресе. Скачанный файл fb2 или epub добавьте кнопкой «Добавить файл» — он привяжется к этой книге, статус и серия сохранятся.</p>
    <input type="file" class="ws-file" accept=".fb2,.epub,.zip,application/epub+zip,application/zip" hidden>`;
  document.body.appendChild(sheet);
  const q = s => sheet.querySelector(s);

  q(".ws-add").onclick = () => q(".ws-file").click();
  q(".ws-file").onchange = async e => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file || !current) return;
    const id = current.id;
    await closeSheet();
    await api.importFiles([file], { attachTo: id });
  };
  q(".ws-status").onclick = async () => {
    const b = current;
    await closeSheet();
    api.pickStatus({ ...b, st: statusOf(b) });
  };
  q(".ws-del").onclick = async () => {
    const b = current;
    await closeSheet();
    api.removeWish(b);
  };

  // свайп вниз закрывает панель (как у панелей из index.html)
  let y0 = null;
  sheet.addEventListener("touchstart", e => { if (sheet.scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener("touchend", e => {
    if (y0 !== null && e.changedTouches[0].clientY - y0 > 70) closeSheet();
    y0 = null;
  });
}

export async function showWish(id) {
  let b;
  try { b = await getBook(id); } catch { b = null; }
  if (!b) { toast("Книга не найдена"); return; }
  current = b;
  const q = s => sheet.querySelector(s);
  q(".ws-cover").replaceChildren(coverEl(b, "big"));
  q(".ws-title").textContent = b.title;
  q(".ws-author").textContent = b.author || "Автор не указан";
  q(".ws-meta").textContent = [b.year, b.publisher].filter(Boolean).join(" · ");
  q(".ws-status").textContent = `Статус: ${statusName(statusOf(b)).toLowerCase()}`;
  q(".ws-genres").textContent = (b.genres || []).join(" · ");
  q(".ws-genres").hidden = !b.genres?.length;
  q(".ws-desc").textContent = b.description || "";          // только текст, никакого HTML из интернета
  q(".ws-desc").hidden = !b.description;
  const src = q(".ws-source");
  src.hidden = !b.sourceUrl;
  if (b.sourceUrl) { src.href = b.sourceUrl; src.textContent = `Страница книги ${SRC[b.source] || "на сайте"} ↗`; }
  q(".ws-where").href = litresUrl(b);
  openSheet("wishSheet", () => { current = null; });
}
