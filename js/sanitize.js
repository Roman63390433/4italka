// Очистка HTML из книги. Мы не вставляем чужой HTML как есть: проходим по нему и
// пересобираем только разрешённые теги, без атрибутов. Так скрипты и чужие ссылки не попадут на страницу.

const KEEP = new Set(["p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "em", "i", "b", "strong", "u", "s",
  "sub", "sup", "small", "blockquote", "ul", "ol", "li", "hr", "pre", "code", "table", "thead", "tbody",
  "tr", "td", "th", "dl", "dt", "dd"]);
// блочные контейнеры превращаем в div
const AS_DIV = new Set(["div", "section", "article", "aside", "figure", "figcaption", "header", "footer",
  "main", "center", "address", "nav"]);
// эти выбрасываем целиком вместе с содержимым
const DROP = new Set(["script", "style", "head", "title", "link", "meta", "iframe", "object", "embed",
  "form", "input", "button", "select", "textarea", "noscript", "template", "audio", "video", "canvas"]);

/**
 * @param {Node} root — откуда брать содержимое (например, <body> главы)
 * @param {(src:string)=>string|null} imageUrl — превращает путь картинки в адрес blob: или null
 * @returns {DocumentFragment}
 */
export function sanitize(root, imageUrl = () => null) {
  const out = document.createDocumentFragment();
  copyChildren(root, out, imageUrl);
  return out;
}

function copyChildren(from, to, imageUrl) {
  for (const node of from.childNodes) {
    if (node.nodeType === 3) { to.appendChild(document.createTextNode(node.nodeValue)); continue; }
    if (node.nodeType !== 1) continue;
    const tag = node.localName.toLowerCase();
    if (DROP.has(tag)) continue;

    if (tag === "img" || tag === "image") {
      const src = node.getAttribute("src") || node.getAttribute("href") || node.getAttribute("xlink:href") ||
        [...node.attributes].find(a => a.localName === "href")?.value;
      const url = src ? imageUrl(src) : null;
      if (url) {
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        to.appendChild(img);
      }
      continue;
    }
    if (tag === "svg") { copyChildren(node, to, imageUrl); continue; } // из svg берём только картинки

    let el = null;
    if (KEEP.has(tag)) el = document.createElement(tag);
    else if (AS_DIV.has(tag)) el = document.createElement("div");

    if (el) { copyChildren(node, el, imageUrl); to.appendChild(el); }
    else copyChildren(node, to, imageUrl);   // неизвестный тег (span, a, …) — оставляем только содержимое
  }
}
