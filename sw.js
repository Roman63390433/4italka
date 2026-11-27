// «Сторож» (Service Worker): хранит копию файлов приложения, чтобы читалка открывалась без интернета.
// Файлы приложения берутся из сети, а копия нужна на случай, когда интернета нет.
// При добавлении новых файлов впишите их в FILES и увеличьте VERSION.
const VERSION = "v7";
const APP = "chitalka-app-" + VERSION;
const FONTS = "chitalka-fonts";
const DATA = "chitalka-data";      // data/*.json главной — копия переживает обновление приложения
const COVERS = "chitalka-covers";  // обложки новинок с fantlab.ru
const COVERS_MAX = 300;
const FILES = [
  "./", "index.html", "manifest.json", "css/style.css", "css/home.css", "img/still-life-books.webp", "img/rose-plate.jpg",
  "js/app.js", "js/shelf.js", "js/reader-ui.js", "js/look.js", "js/sheet.js", "js/settings.js",
  "js/storage.js", "js/paginator.js", "js/scroller.js", "js/view.js", "js/anchor.js", "js/marks.js", "js/marks-ui.js", "js/status.js", "js/series.js", "js/series-ui.js", "js/covers.js", "js/zip.js", "js/sanitize.js",
  "js/home.js", "js/home-data.js", "js/catalog.js", "js/fantlab.js", "js/wikisource.js", "js/wish.js", "js/wish-ui.js", "js/share.js",
  "js/parsers/index.js", "js/parsers/fb2.js", "js/parsers/epub.js",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(APP).then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("chitalka-app-") && k !== APP).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // «Поделиться → Читалка»: Android присылает файлы POST-запросом на ./share (см. share_target в manifest.json).
  // Кладём файлы во временную копию SHARE_CACHE и открываем читалку с ?share=1 — дальше их забирает js/share.js
  if (e.request.method === "POST" && url.origin === location.origin && url.pathname.endsWith("/share")) {
    e.respondWith((async () => {
      try {
        const form = await e.request.formData();
        const files = form.getAll("books").filter(f => f && typeof f !== "string" && f.size);
        const c = await caches.open("chitalka-share");
        for (const [i, f] of files.entries()) {
          await c.put(new URL("share-inbox/" + Date.now() + "-" + i, self.registration.scope).href,
            new Response(f, { headers: { "X-Name": encodeURIComponent(f.name || "книга") } }));
        }
      } catch {}                          // не получилось — share.js скажет, что файл не пришёл
      return Response.redirect(new URL("./?share=1", self.registration.scope).href, 303);
    })());
    return;
  }

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

  // данные главной: сначала из сети, без интернета — последняя сохранённая копия
  if (url.origin === location.origin && url.pathname.includes("/data/")) {
    e.respondWith(fetch(e.request.url, { cache: "no-cache" }).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(DATA).then(c => c.put(url.pathname, copy)); }
      return r;
    }).catch(() => caches.open(DATA).then(c => c.match(url.pathname)).then(r => r || Response.error())));
    return;
  }

  // обложки FantLab: из копии, если уже есть; копий не больше COVERS_MAX (старые удаляются)
  if (url.host === "fantlab.ru" && url.pathname.startsWith("/images/")) {
    e.respondWith(caches.open(COVERS).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok || r.type === "opaque") {
        await c.put(e.request, r.clone());
        const keys = await c.keys();
        for (const k of keys.slice(0, Math.max(0, keys.length - COVERS_MAX))) await c.delete(k);
      }
      return r;
    }));
    return;
  }

  // файлы приложения: сначала свежие из сети (и обновляем копию), без интернета — из копии.
  // cache: "no-cache" — всегда сверяться с сервером, чтобы после обновления не смешались старые и новые файлы
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request.url, { cache: "no-cache", credentials: "same-origin" }).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(APP).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});
