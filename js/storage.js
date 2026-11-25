// Хранилище: книги и файлы — в IndexedDB (большой «шкаф» браузера), позиции чтения — в localStorage.
const DB_NAME = "chitalka";
let dbPromise = null;

function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        d.createObjectStore("books", { keyPath: "id" });
        d.createObjectStore("files", { keyPath: "id" });
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
  return run(["books", "files"], "readwrite", (b, f) => { b.delete(id); f.delete(id); });
}

// позиция чтения: { ch — номер главы, frac — доля главы 0..1, percent — сколько прочитано, at — когда }
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
