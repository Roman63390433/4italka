// Разбор epub. epub — это zip: внутри META-INF/container.xml указывает на файл .opf,
// в .opf — описание книги (metadata), список файлов (manifest) и порядок чтения (spine).
import { openZip } from "../zip.js";
import { sanitize } from "../sanitize.js";

const byName = (doc, name) => [...doc.getElementsByTagName("*")].filter(e => e.localName === name);
const clean = s => (s || "").replace(/\s+/g, " ").trim();

// путь относительно папки файла: ("OEBPS/text/ch1.xhtml", "../img/a.jpg") → "OEBPS/img/a.jpg"
function resolve(base, rel) {
  rel = decodeURIComponent(rel.split("#")[0].split("?")[0]);
  if (/^[a-z]+:/i.test(rel)) return null;            // внешняя ссылка — не берём
  const parts = base.split("/").slice(0, -1);
  for (const p of rel.split("/")) {
    if (p === "..") parts.pop();
    else if (p && p !== ".") parts.push(p);
  }
  return parts.join("/");
}

function parseXml(text, type = "application/xhtml+xml") {
  let doc = new DOMParser().parseFromString(text, type);
  if (doc.getElementsByTagName("parsererror").length) doc = new DOMParser().parseFromString(text, "text/html");
  return doc;
}

export async function parseEpub(buffer) {
  const zip = await openZip(buffer);
  const urls = [];

  const container = await zip.text(zip.find("META-INF/container.xml") || "");
  if (!container) throw new Error("Это не epub: нет файла container.xml");
  const opfPath = byName(parseXml(container, "application/xml"), "rootfile")[0]?.getAttribute("full-path");
  const opfText = opfPath && await zip.text(zip.find(opfPath) || "");
  if (!opfText) throw new Error("epub повреждён: нет описания книги (.opf)");
  const opf = parseXml(opfText, "application/xml");

  // --- описание ---
  const title = clean(byName(opf, "title")[0]?.textContent) || "Без названия";
  const author = byName(opf, "creator").map(e => clean(e.textContent)).filter(Boolean).join(", ");
  const { series, seriesNo } = seriesOf(opf);

  // --- список файлов ---
  const manifest = new Map();
  for (const it of byName(opf, "item")) {
    manifest.set(it.getAttribute("id"), {
      path: resolve(opfPath, it.getAttribute("href") || ""),
      type: it.getAttribute("media-type") || "",
      props: it.getAttribute("properties") || "",
    });
  }

  // --- картинки: путь в архиве → blob: адрес ---
  const imgCache = new Map();
  async function loadImage(path) {
    if (!path || imgCache.has(path)) return;
    const real = zip.find(path);
    const data = real && await zip.bytes(real);
    let url = null;
    if (data) {
      const ext = path.split(".").pop().toLowerCase();
      const type = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp" }[ext] || "image/jpeg";
      // svg-картинки не берём: в них может быть код
      if (type !== "image/svg+xml") { url = URL.createObjectURL(new Blob([data], { type })); urls.push(url); }
    }
    imgCache.set(path, url);
  }

  // --- обложка ---
  let coverItem = [...manifest.values()].find(m => m.props.split(" ").includes("cover-image"));
  if (!coverItem) {
    const id = byName(opf, "meta").find(m => m.getAttribute("name") === "cover")?.getAttribute("content");
    coverItem = id && manifest.get(id);
  }
  let cover = null;
  if (coverItem && coverItem.type.startsWith("image/") && !coverItem.type.includes("svg")) {
    const d = await zip.bytes(zip.find(coverItem.path) || "");
    if (d) cover = new Blob([d], { type: coverItem.type });
  }

  // --- оглавление: путь файла → название главы ---
  const tocTitles = new Map();
  const nav = [...manifest.values()].find(m => m.props.split(" ").includes("nav"));
  if (nav) {
    const doc = parseXml(await zip.text(zip.find(nav.path) || "") || "<x/>");
    for (const a of byName(doc, "a")) {
      const p = resolve(nav.path, a.getAttribute("href") || "");
      if (p && !tocTitles.has(p)) tocTitles.set(p, clean(a.textContent));
    }
  }
  const spineEl = byName(opf, "spine")[0];
  const ncx = manifest.get(spineEl?.getAttribute("toc"));
  if (!tocTitles.size && ncx) {
    const doc = parseXml(await zip.text(zip.find(ncx.path) || "") || "<x/>", "application/xml");
    for (const np of byName(doc, "navPoint")) {
      const src = byName(np, "content")[0]?.getAttribute("src");
      const label = clean(byName(np, "text")[0]?.textContent);
      const p = src && resolve(ncx.path, src);
      if (p && label && !tocTitles.has(p)) tocTitles.set(p, label);
    }
  }

  // --- главы по порядку чтения ---
  const chapters = [];
  for (const ref of spineEl ? byName(spineEl, "itemref") : []) {
    const item = manifest.get(ref.getAttribute("idref"));
    if (!item || !/html|xml/.test(item.type)) continue;
    const html = await zip.text(zip.find(item.path) || "");
    if (!html) continue;
    const doc = parseXml(html);
    const body = doc.body || byName(doc, "body")[0];
    if (!body) continue;

    // сначала загружаем все картинки главы, потом чистим HTML
    const srcs = [...body.getElementsByTagName("*")]
      .filter(e => e.localName === "img" || e.localName === "image")
      .map(e => e.getAttribute("src") || e.getAttribute("xlink:href") || [...e.attributes].find(a => a.localName === "href")?.value)
      .filter(Boolean).map(s => resolve(item.path, s));
    for (const p of srcs) await loadImage(p);

    const box = document.createElement("div");
    box.append(sanitize(body, src => imgCache.get(resolve(item.path, src)) || null));
    const chars = box.textContent.replace(/\s+/g, " ").trim().length;
    if (!chars && !box.querySelector("img")) continue;      // пустые служебные страницы пропускаем
    const h = box.querySelector("h1,h2,h3");
    chapters.push({ title: tocTitles.get(item.path) || clean(h?.textContent) || `Часть ${chapters.length + 1}`, html: box.innerHTML, chars });
  }
  if (!chapters.length) throw new Error("В epub не найден текст");

  return { title, author, series, seriesNo, cover, chapters, notes: new Map(), urls };
}

// серия: Calibre пишет <meta name="calibre:series" content="..."> и calibre:series_index,
// EPUB 3 — <meta property="belongs-to-collection" id="c1">Название</meta> и <meta refines="#c1" property="group-position">2</meta>
function seriesOf(opf) {
  const metas = byName(opf, "meta");
  const named = n => metas.find(m => m.getAttribute("name") === n)?.getAttribute("content");
  let series = clean(named("calibre:series")), no = parseFloat(named("calibre:series_index"));
  if (!series) {
    const col = metas.find(m => m.getAttribute("property") === "belongs-to-collection");
    if (col) {
      series = clean(col.textContent);
      const id = col.getAttribute("id");
      const pos = id && metas.find(m => m.getAttribute("refines") === "#" + id && m.getAttribute("property") === "group-position");
      no = parseFloat(pos?.textContent);
    }
  }
  return { series: series || null, seriesNo: series && Number.isFinite(no) ? no : null };
}
