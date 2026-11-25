// Полка: список книг, «Продолжить», добавление, удаление, поиск по своим книгам.
import { listBooks, addBook, deleteBook, getPos, askPersist } from "./storage.js";
import { parseBook, releaseBook } from "./parsers/index.js";
import { ask, toast } from "./sheet.js";

const $ = id => document.getElementById(id);
let openHandler = () => {};
let coverUrls = [];

export function initShelf(onOpen) {
  openHandler = onOpen;
  $("addBtn").onclick = () => $("fileInput").click();
  $("emptyAdd").onclick = () => $("fileInput").click();
  $("fileInput").onchange = async e => {
    const files = [...e.target.files];
    e.target.value = "";                 // чтобы тот же файл можно было выбрать ещё раз
    for (const f of files) await importFile(f);
    renderShelf();
  };
  $("search").oninput = () => renderShelf();
}

async function importFile(file) {
  toast(`Добавляю «${file.name}»…`, 10000);
  try {
    const book = await parseBook(file, file.name);
    releaseBook(book);
    const existing = await listBooks();
    if (existing.some(b => b.title === book.title && b.author === book.author && b.size === file.size)) {
      toast(`«${book.title}» уже на полке`);
      return;
    }
    await addBook({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
      title: book.title, author: book.author, format: book.format,
      size: file.size, chars: book.chars, cover: book.cover || null,
      added: Date.now(), opened: 0,
    }, file);
    askPersist();                         // попросить браузер хранить книги надёжно
    toast(`Добавлено: «${book.title}»`);
  } catch (e) {
    const msg = e.name === "QuotaExceededError" ? "в телефоне не хватает места" : e.message;
    toast(`Не удалось добавить «${file.name}»: ${msg}`, 6000);
  }
}

// цвет нарисованной обложки — постоянный для каждой книги
const PALETTE = ["#2d4a5a", "#6b3b2e", "#3d4d36", "#5a4a2e", "#40344f", "#5e6b46", "#a4635d", "#7a5a48"];
const colorFor = s => PALETTE[[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length];

function coverEl(b, big = false) {
  const el = document.createElement("div");
  el.className = "cover" + (big ? " big" : "");
  if (b.cover) {
    const url = URL.createObjectURL(b.cover);
    coverUrls.push(url);
    const img = document.createElement("img");
    img.src = url; img.alt = "";
    el.classList.add("has-img");
    el.appendChild(img);
  } else {
    el.style.background = colorFor(b.title);
    const a = document.createElement("span"); a.className = "c-a"; a.textContent = (b.author || "").split(/[ ,]/).filter(Boolean).pop() || "";
    const t = document.createElement("span"); t.className = "c-t"; t.textContent = b.title;
    const m1 = document.createElement("span"); m1.className = "c-mark";
    el.append(a, m1, t, m1.cloneNode());
  }
  return el;
}

const progressText = p => !p ? "новая" : p >= 100 ? "прочитано" : p + "%";

export async function renderShelf() {
  coverUrls.forEach(u => URL.revokeObjectURL(u));
  coverUrls = [];
  let books = [];
  try { books = await listBooks(); }
  catch { toast("Не удалось прочитать полку из памяти браузера", 5000); }

  books.forEach(b => { b.percent = getPos(b.id)?.percent || 0; });
  books.sort((a, b) => (b.opened || b.added) - (a.opened || a.added));

  // «Продолжить» — последняя открытая и недочитанная
  const cont = books.find(b => b.opened && b.percent < 100);
  const box = $("continue");
  box.hidden = !cont;
  box.innerHTML = "";
  if (cont) {
    box.appendChild(coverEl(cont, true));
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

  // список с учётом поиска
  const q = $("search").value.trim().toLowerCase();
  const shown = books.filter(b => !q || (b.title + " " + b.author).toLowerCase().includes(q));
  const list = $("books");
  list.innerHTML = "";
  for (const b of shown) {
    const li = document.createElement("li");
    const open = document.createElement("button");
    open.className = "book-open";
    open.appendChild(coverEl(b));
    const text = document.createElement("span");
    text.className = "book-text";
    text.innerHTML = `<span class="b-title"></span><span class="b-author"></span>`;
    text.firstChild.textContent = b.title;
    text.lastChild.textContent = b.author || "Автор не указан";
    open.appendChild(text);
    const pct = document.createElement("span");
    pct.className = "pct";
    pct.textContent = progressText(b.percent);
    open.appendChild(pct);
    open.onclick = () => openHandler(b.id);

    const more = document.createElement("button");
    more.className = "row-more";
    more.setAttribute("aria-label", "Действия с книгой");
    more.textContent = "⋮";
    more.onclick = () => bookActions(b);
    li.append(open, more);
    list.appendChild(li);
  }

  $("empty").hidden = books.length > 0;
  $("search").parentElement.hidden = books.length < 4;          // поиск нужен, когда книг много
  document.querySelector("#shelf .ornament").hidden = !cont || !shown.length;
  if (books.length && !shown.length) list.innerHTML = '<li class="muted nothing">Ничего не нашлось</li>';
}

async function bookActions(b) {
  const choice = await ask(`«${b.title}»`, [{ id: "read", text: "Читать" }, { id: "del", text: "Удалить с полки", danger: true }]);
  if (choice === "read") openHandler(b.id);
  if (choice === "del") {
    const sure = await ask(`Удалить «${b.title}» из читалки? Файл в «Загрузках» останется.`, [{ id: "yes", text: "Удалить", danger: true }]);
    if (sure === "yes") {
      try { await deleteBook(b.id); toast("Книга удалена"); }
      catch { toast("Не удалось удалить книгу"); }
      renderShelf();
    }
  }
}
