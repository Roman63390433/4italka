// «Сторож» (Service Worker): хранит копию файлов приложения, чтобы читалка открывалась без интернета.
// Файлы приложения берутся из сети, а копия нужна на случай, когда интернета нет.
// При добавлении новых файлов впишите их в FILES и увеличьте VERSION.
const VERSION = "v3";
const APP = "chitalka-app-" + VERSION;
const FONTS = "chitalka-fonts";
const FILES = [
  "./", "index.html", "manifest.json", "css/style.css",
  "js/app.js", "js/shelf.js", "js/reader-ui.js", "js/look.js", "js/sheet.js", "js/settings.js",
  "js/storage.js", "js/paginator.js", "js/scroller.js", "js/view.js", "js/anchor.js", "js/marks.js", "js/marks-ui.js", "js/zip.js", "js/sanitize.js",
  "js/parsers/index.js", "js/parsers/fb2.js", "js/parsers/epub.js",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("chitalka-app-") && k !== APP).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // шрифты Google: берём из копии, а в фоне обновляем
  if (url.host === "fonts.googleapis.com" || url.host === "fonts.gstatic.com") {
    e.respondWith(caches.open(FONTS).then(async c => {
      const hit = await c.match(e.request);
      const net = fetch(e.request).then(r => { if (r.ok || r.type === "opaque") c.put(e.request, r.clone()); return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  // файлы приложения: сначала свежие из сети (и обновляем копию), без интернета — из копии
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(APP).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});
