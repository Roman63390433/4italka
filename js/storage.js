// Хранилище: книги и файлы — в IndexedDB (большой «шкаф» браузера), позиции чтения — в localStorage.
const DB_NAME = "chitalka";
let dbPromise = null;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 2);
      // версия базы растёт, когда появляются новые «ящики»; старые данные при этом остаются
      req.onupgradeneeded = e => {
        const d = req.result;
        if (e.oldVersion < 1) {
          d.createObjectStore("books", { keyPath: "id" });
          d.createObjectStore("files", { keyPath: "id" });
        }
        if (e.oldVersion < 2) {
          // закладки и заметки; индекс bookId — чтобы быстро достать всё по одной книге
          d.createObjectStore("marks", { keyPath: "id" }).createIndex("bookId", "bookId");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

// одна «транзакция» = одна операция с базой; оборачиваем в Promise, чтобы писать через await
async function run(stores, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(stores, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Операция отменена"));
    const req = fn(...stores.map(s => tx.objectStore(s)));
    if (req) req.onsuccess = () => { result = req.result; };
  });
}

export const listBooks = () => run(["books"], "readonly", s => s.getAll());
export const getBook = id => run(["books"], "readonly", s => s.get(id));
export const getFile = id => run(["files"], "readonly", s => s.get(id)).then(r => r && r.blob);
export const updateBook = book => run(["books"], "readwrite", s => s.put(book));

export function addBook(book, blob) {
  return run(["books", "files"], "readwrite", (b, f) => { b.put(book); f.put({ id: book.id, blob }); });
}

export function deleteBook(id) {
  localStorage.removeItem("chitalka.pos." + id);
  localStorage.removeItem("chitalka.look." + id);
  return run(["books", "files", "marks"], "readwrite", (b, f, m) => {
    b.delete(id); f.delete(id);
    m.index("bookId").openKeyCursor(IDBKeyRange.only(id)).onsuccess = e => {
      const c = e.target.result;
      if (c) { m.delete(c.primaryKey); c.continue(); }
    };
  });
}

// ---- закладки и заметки ----
export const listMarks = bookId => run(["marks"], "readonly", m => m.index("bookId").getAll(bookId));
export const putMark = mark => run(["marks"], "readwrite", m => m.put(mark));
export const deleteMark = id => run(["marks"], "readwrite", m => m.delete(id));

// позиция чтения: { ch — номер главы, off — номер первой видимой буквы в главе, percent — сколько прочитано, at — когда }
// (в старых позициях вместо off было frac — доля главы; читалка понимает оба вида)
export function getPos(id) {
  try { return JSON.parse(localStorage.getItem("chitalka.pos." + id)) || null; }
  catch { return null; }
}
export function savePos(id, pos) {
  localStorage.setItem("chitalka.pos." + id, JSON.stringify({ ...pos, at: Date.now() }));
}

// просим браузер не удалять наши данные при нехватке места
export async function askPersist() {
  if (!navigator.storage?.persist) return false;
  return (await navigator.storage.persisted()) || navigator.storage.persist();
}
export async function usage() {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { used: e.usage || 0, quota: e.quota || 0, persisted: await navigator.storage.persisted?.() };
}
