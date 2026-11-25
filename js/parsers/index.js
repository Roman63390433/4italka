// Общий вход для всех форматов: по файлу определяет формат и возвращает книгу в одном виде:
// { title, author, cover: Blob|null, chapters: [{ title, html, chars }], notes: Map, urls: [], format, chars }
import { parseFb2, decodeFb2 } from "./fb2.js";
import { parseEpub } from "./epub.js";
import { openZip } from "../zip.js";

export async function parseBook(blob, fileName = "") {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;     // zip начинается с букв «PK»
  let book;

  if (isZip) {
    const zip = await openZip(buffer);
    if (zip.find("META-INF/container.xml")) {
      book = await parseEpub(buffer);
      book.format = "epub";
    } else {
      const fb2 = zip.names.find(n => n.toLowerCase().endsWith(".fb2"));
      if (!fb2) throw new Error("В архиве нет книги fb2 или epub");
      book = parseFb2(decodeFb2(await zip.bytes(fb2)));
      book.format = "fb2";
    }
  } else {
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1000));
    if (!/<FictionBook/i.test(head)) {
      throw new Error(/\.pdf$/i.test(fileName) ? "PDF пока не поддерживается" : "Формат не поддерживается: нужен fb2, fb2.zip или epub");
    }
    book = parseFb2(decodeFb2(bytes));
    book.format = "fb2";
  }

  book.chars = book.chapters.reduce((s, c) => s + c.chars, 0) || 1;
  return book;
}

// освободить память от картинок книги, когда она закрыта
export function releaseBook(book) {
  for (const u of book?.urls || []) URL.revokeObjectURL(u);
}
