// Приём книг через меню «Поделиться» Android.
// Android отдаёт файл «сторожу» (sw.js), тот кладёт его во временную копию "chitalka-share"
// и открывает читалку с адресом ?share=1. Здесь забираем файлы оттуда и добавляем на полку.
import { importFiles } from "./shelf.js";
import { toast } from "./sheet.js";

const SHARE_CACHE = "chitalka-share";   // то же имя, что в sw.js

// showShelf — функция из app.js, которая переключает на вкладку «Полка»
export async function receiveShared(showShelf) {
  const params = new URLSearchParams(location.search);
  if (!params.has("share")) return;

  // убираем ?share=1 из адреса, чтобы при обновлении страницы книга не добавлялась снова
  params.delete("share");
  const rest = params.toString();
  history.replaceState(history.state, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
  showShelf();

  let files = [];
  try {
    const c = await caches.open(SHARE_CACHE);
    for (const req of await c.keys()) {
      const r = await c.match(req);
      if (r) {
        const name = decodeURIComponent(r.headers.get("X-Name") || "книга");
        files.push(new File([await r.blob()], name));
      }
      await c.delete(req);
    }
  } catch {
    toast("Не удалось получить файл. Добавьте книгу через «+» на полке.", 6000);
    return;
  }

  if (!files.length) {
    toast("Файл не пришёл. Попробуйте ещё раз или добавьте книгу через «+».", 6000);
    return;
  }
  await importFiles(files);          // подсказки «Добавлено…» / «уже на полке» показывает сама полка
}
