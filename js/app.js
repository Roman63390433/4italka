// Запуск приложения: связывает полку, читалку, оформление и экран «Ещё».
import { initShelf, renderShelf } from "./shelf.js";
import { openBook, relayout, switchMode } from "./reader-ui.js";
import { initLook, setFullscreenPref } from "./look.js";
import { usage, askPersist } from "./storage.js";
import { toast } from "./sheet.js";

const $ = id => document.getElementById(id);

initLook({ relayout, mode: switchMode });
initShelf(id => openBook(id, renderShelf));
renderShelf();

// ---- нижнее меню: Полка / Ещё ----
document.querySelectorAll("#tabbar a").forEach(a => a.onclick = e => {
  e.preventDefault();
  showTab(a.dataset.tab);
});
function showTab(tab) {
  $("shelf").hidden = tab !== "shelf";
  $("more").hidden = tab !== "more";
  document.querySelectorAll("#tabbar a").forEach(a => a.classList.toggle("on", a.dataset.tab === tab));
  if (tab === "more") showUsage();
  window.scrollTo(0, 0);
}

// ---- экран «Ещё»: сколько места занято ----
const mb = n => (n / 1048576).toFixed(n < 10485760 ? 1 : 0).replace(".", ",") + " МБ";
async function showUsage() {
  const u = await usage().catch(() => null);
  $("usage").textContent = u ? `Занято ${mb(u.used)} из доступных ${mb(u.quota)}.` +
    (u.persisted ? " Книги защищены от автоудаления." : "") : "Браузер не сообщает, сколько места занято.";
  $("persistBtn").hidden = !!u?.persisted;
}
$("persistBtn").onclick = async () => {
  const ok = await askPersist();
  toast(ok ? "Готово: браузер не будет удалять книги" : "Браузер не разрешил. Установите читалку на главный экран и попробуйте снова.", 5000);
  showUsage();
};

$("fsToggle").onchange = e => setFullscreenPref(e.target.checked);

// ---- пересчёт страниц при повороте экрана и смене размера окна ----
let rt;
window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(relayout, 150); });
document.fonts?.addEventListener?.("loadingdone", () => relayout());

// ---- работа без интернета ----
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
