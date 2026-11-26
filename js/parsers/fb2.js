// Разбор fb2. fb2 — это XML: описание книги (<description>), текст (<body>) и картинки (<binary> в base64).
// На выходе — общий для всех форматов вид книги (см. parsers/index.js).

const hrefOf = el => el.getAttribute("l:href") || el.getAttribute("xlink:href") ||
  [...el.attributes].find(a => a.localName === "href")?.value || "";
const kids = (el, name) => [...el.children].filter(c => c.localName === name);
const first = (el, name) => el && [...el.getElementsByTagName("*")].find(c => c.localName === name) || null;
const text = el => (el ? el.textContent : "").replace(/\s+/g, " ").trim();

// fb2 часто в кодировке windows-1251: читаем её из заголовка <?xml ... encoding="..."?>
export function decodeFb2(bytes) {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 300));
  const enc = (head.match(/encoding=["']([\w-]+)["']/i) || [])[1] || "utf-8";
  try { return new TextDecoder(enc).decode(bytes); }
  catch { return new TextDecoder("utf-8").decode(bytes); }
}

export function parseFb2(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Файл fb2 повреждён (ошибка в XML)");
  const root = doc.documentElement;
  const urls = [];

  // --- описание книги ---
  const info = first(root, "title-info");
  const title = text(first(info, "book-title")) || "Без названия";
  const authors = info ? kids(info, "author").map(a =>
    [text(first(a, "first-name")), text(first(a, "last-name"))].filter(Boolean).join(" ") || text(first(a, "nickname"))
  ).filter(Boolean) : [];
  // серия: <sequence name="..." number="..."/> (может быть вложенной — берём первую с названием)
  const seq = info ? [...info.getElementsByTagName("*")].find(e => e.localName === "sequence" && e.getAttribute("name")?.trim()) : null;
  const series = seq ? seq.getAttribute("name").replace(/\s+/g, " ").trim() : null;
  const seriesNo = seq ? parseFloat(seq.getAttribute("number")) || null : null;

  // --- картинки: <binary id="..." content-type="...">base64</binary> ---
  const binaries = new Map();
  for (const b of [...root.children].filter(c => c.localName === "binary")) {
    binaries.set(b.getAttribute("id"), b);
  }
  const blobCache = new Map();
  function blobFor(id) {
    if (blobCache.has(id)) return blobCache.get(id);
    const b = binaries.get(id);
    let blob = null;
    if (b) {
      try {
        const bin = atob(b.textContent.replace(/\s+/g, ""));
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        blob = new Blob([arr], { type: b.getAttribute("content-type") || "image/jpeg" });
      } catch { blob = null; }        // испорченная картинка — просто пропускаем
    }
    blobCache.set(id, blob);
    return blob;
  }
  const urlCache = new Map();
  function imageUrl(href) {
    const id = href.replace(/^#/, "");
    if (urlCache.has(id)) return urlCache.get(id);
    const blob = blobFor(id);
    const url = blob ? URL.createObjectURL(blob) : null;
    if (url) urls.push(url);
    urlCache.set(id, url);
    return url;
  }

  const coverImg = first(first(info, "coverpage"), "image");
  const cover = coverImg ? blobFor(hrefOf(coverImg).replace(/^#/, "")) : null;

  // --- текст: основное тело и тело со сносками ---
  const bodies = [...root.children].filter(c => c.localName === "body");
  const main = bodies.find(b => !b.getAttribute("name")) || bodies[0];
  if (!main) throw new Error("В файле fb2 нет текста");
  const notesBody = bodies.find(b => /notes|comments/i.test(b.getAttribute("name") || ""));

  // сноски: id → HTML
  const notes = new Map();
  if (notesBody) {
    for (const s of notesBody.getElementsByTagName("*")) {
      if (s.localName === "section" && s.getAttribute("id")) {
        const box = document.createElement("div");
        for (const c of s.children) if (c.localName !== "title") convert(c, box, 3);
        notes.set(s.getAttribute("id"), box.innerHTML);
      }
    }
  }

  // перевод элементов fb2 в HTML (строим DOM сами — значит, ничего чужого не попадёт)
  function convert(node, to, depth) {
    if (node.nodeType === 3) { to.appendChild(document.createTextNode(node.nodeValue)); return; }
    if (node.nodeType !== 1) return;
    const n = node.localName;
    const add = (tag, cls) => {
      const el = document.createElement(tag);
      if (cls) el.className = cls;
      for (const c of node.childNodes) convert(c, el, depth);
      to.appendChild(el);
    };
    switch (n) {
      case "p": return add("p");
      case "title": {
        const h = document.createElement("h" + Math.min(depth, 4));
        h.textContent = kids(node, "p").map(text).filter(Boolean).join(". ") || text(node);
        to.appendChild(h);
        return;
      }
      case "subtitle": return add("h5");
      case "epigraph": return add("blockquote", "epigraph");
      case "cite": return add("blockquote");
      case "text-author": return add("p", "text-author");
      case "poem": return add("div", "poem");
      case "stanza": return add("div", "stanza");
      case "v": return add("p", "v");
      case "emphasis": return add("em");
      case "strong": return add("strong");
      case "strikethrough": return add("s");
      case "sub": return add("sub");
      case "sup": return add("sup");
      case "code": return add("code");
      case "empty-line": to.appendChild(document.createElement("br")); return;
      case "image": {
        const url = imageUrl(hrefOf(node));
        if (url) { const img = document.createElement("img"); img.src = url; img.alt = ""; to.appendChild(img); }
        return;
      }
      case "a": {
        const id = hrefOf(node).replace(/^#/, "");
        if (notes.has(id)) {
          const sup = document.createElement("sup");
          sup.className = "note";
          sup.dataset.note = id;
          sup.textContent = text(node).replace(/[\[\]{}]/g, "") || "*";
          to.appendChild(sup);
        } else for (const c of node.childNodes) convert(c, to, depth);
        return;
      }
      case "section": {
        const box = document.createElement("div");
        box.className = "section";
        for (const c of node.childNodes) convert(c, box, depth + 1);
        to.appendChild(box);
        return;
      }
      case "table": return add("table");
      case "tr": return add("tr");
      case "td": return add("td");
      case "th": return add("th");
      default: for (const c of node.childNodes) convert(c, to, depth);
    }
  }

  // главы = секции верхнего уровня; то, что до них (название, эпиграф), — в первую главу
  const chapters = [];
  let lead = document.createElement("div");
  for (const c of main.children) {
    if (c.localName === "section") {
      const box = document.createElement("div");
      if (lead.childNodes.length) { box.append(...lead.childNodes); }
      for (const cc of c.childNodes) convert(cc, box, 2);
      const t = first(c, "title");
      chapters.push({ title: t && c.firstElementChild?.localName === "title" ? text(t) : `Глава ${chapters.length + 1}`, html: box.innerHTML, chars: box.textContent.length });
    } else convert(c, lead, 1);
  }
  if (!chapters.length) chapters.push({ title, html: lead.innerHTML, chars: lead.textContent.length });
  else if (lead.childNodes.length) { // текст после последней секции
    const last = chapters[chapters.length - 1];
    last.html += lead.innerHTML;
    last.chars += lead.textContent.length;
  }

  return { title, author: authors.join(", "), series, seriesNo, cover, chapters, notes, urls };
}
