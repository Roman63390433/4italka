// Закладки и заметки: создание, список по главам, поиск, текст для экспорта.
// Без кнопок и экранов. Место в книге — тот же якорь, что у позиции чтения: глава + номер буквы.
//
// Запись: { id, bookId, type: "bookmark" | "note", ch, start, end, quote, note, color, frac, chapterTitle, created }
//   start/end — буквы в главе (у закладки end = start), quote — кусочек текста, frac — доля книги (для рисок),
//   color — цвет подсветки заметки, note — текст заметки (может быть пустым — тогда это просто выделение).
import { listMarks, putMark, deleteMark } from "./storage.js";

export const COLORS = [
  { id: "yellow", name: "Жёлтый" },
  { id: "green", name: "Зелёный" },
  { id: "blue", name: "Голубой" },
  { id: "pink", name: "Розовый" },
];

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2));
const tidy = s => (s || "").replace(/\s+/g, " ").trim();

export async function load(bookId) {
  try {
    const all = await listMarks(bookId);
    return all.sort(byPlace);
  } catch { return []; }
}

export const byPlace = (a, b) => a.ch - b.ch || a.start - b.start;

export function makeBookmark(bookId, { ch, off, quote, frac, chapterTitle }) {
  return { id: newId(), bookId, type: "bookmark", ch, start: off, end: off,
    quote: tidy(quote).slice(0, 140), note: "", color: null, frac, chapterTitle, created: Date.now() };
}

export function makeNote(bookId, { ch, start, end, quote, frac, chapterTitle }, color = "yellow", note = "") {
  return { id: newId(), bookId, type: "note", ch, start, end,
    quote: tidy(quote).slice(0, 2000), note, color, frac, chapterTitle, created: Date.now() };
}

export const save = mark => putMark(mark);
export const remove = id => deleteMark(id);

// заметки одной главы — для подсветки в тексте
export const notesOf = (marks, ch) => marks.filter(m => m.type === "note" && m.ch === ch);

// поиск по цитате, тексту заметки и названию главы
export function search(marks, q) {
  q = tidy(q).toLowerCase();
  if (!q) return marks;
  return marks.filter(m => (m.quote + " " + m.note + " " + (m.chapterTitle || "")).toLowerCase().includes(q));
}

// группы по главам в порядке книги: [{ ch, title, items }]
export function groupByChapter(marks) {
  const groups = [];
  for (const m of [...marks].sort(byPlace)) {
    let g = groups.at(-1);
    if (!g || g.ch !== m.ch) groups.push(g = { ch: m.ch, title: m.chapterTitle || `Глава ${m.ch + 1}`, items: [] });
    g.items.push(m);
  }
  return groups;
}

const dateRu = t => new Date(t).toLocaleDateString("ru-RU");

// текст файла с заметками (и закладками) книги
export function exportText(book, marks) {
  const notes = marks.filter(m => m.type === "note");
  const lines = [`«${book.title}»` + (book.author ? ` — ${book.author}` : ""), `Заметки. Выгружено ${dateRu(Date.now())}`, ""];
  for (const g of groupByChapter(notes)) {
    lines.push(`== ${g.title} ==`, "");
    for (const m of g.items) {
      lines.push(`«${m.quote}»`);
      if (tidy(m.note)) lines.push(`— ${m.note.trim()}`);
      lines.push(`(${dateRu(m.created)})`, "");
    }
  }
  const bms = marks.filter(m => m.type === "bookmark");
  if (bms.length) {
    lines.push("== Закладки ==", "");
    for (const m of bms.sort(byPlace)) lines.push(`${Math.round((m.frac || 0) * 100)}% · ${m.chapterTitle || ""}: ${m.quote}…`);
  }
  return lines.join("\r\n");
}

// имя файла без запрещённых в Windows/Android знаков
export const exportName = book => (book.title || "Книга").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 80) + " — заметки.txt";
