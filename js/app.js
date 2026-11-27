// Запуск приложения: связывает полку, читалку, оформление и экран «Ещё».
import { initShelf, renderShelf } from "./shelf.js";
import { openBook, relayout, switchMode } from "./reader-ui.js";
import { initLook, setFullscreenPref } from "./look.js";
import { usage, askPersist } from "./storage.js";
import { toast } from "./sheet.js";
import { initHome, renderHome } from "./home.js";
import { receiveShared } from "./share.js";

const $ = id => document.getElementById(id);

const openFromShelf = id => openBook(id, renderShelf);
initLook({ relayout, mode: switchMode });
initShelf(openFromShelf);
initHome({ openBook: openFromShelf, showShelf: () => showTab("shelf") });
renderShelf();

// ---- нижнее меню: Главная / Полка / Ещё; открывается та вкладка, что была последней ----
const TABS = ["home", "shelf", "more"];
const TAB_KEY = "chitalka.tab";
document.querySelectorAll("#tabbar a").forEach(a => a.onclick = e => {
  e.preventDefault();
  showTab(a.dataset.tab);
});
function showTab(tab) {
  TABS.forEach(t => { $(t).hidden = t !== tab; });
  document.querySelectorAll("#tabbar a").forEach(a => a.classList.toggle("on", a.dataset.tab === tab));
  if (tab === "home") renderHome();
  if (tab === "shelf") renderShelf();
  if (tab === "more") showUsage();
  localStorage.setItem(TAB_KEY, tab);
  window.scrollTo(0, 0);
}
const lastTab = localStorage.getItem(TAB_KEY);
showTab(TABS.includes(lastTab) ? lastTab : "home");
receiveShared(() => showTab("shelf"));   // книга пришла через «Поделиться» — добавить и показать полку

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
