// Скачивание классики с русской Викитеки (ru.wikisource.org) и сборка из неё файла fb2. Только логика, без кнопок.
//
// Как устроена Викитека:
//  • у произведения бывает «список редакций» (категория «Списки редакций»): ссылки на «…/1969 (СО)», «…/СО»
//    (современная орфография) и «…/1840 (ДО)» (дореформенная, с ятями) — берём только СО;
//  • длинная книга — «оглавление»: страница со ссылками на подстраницы «Книга/Глава 1», «Книга/Часть I/Глава II»;
//    подстраница может сама быть оглавлением (тома, части) — тогда идём глубже;
//  • короткая книга — одна страница; если в ней несколько заголовков — режем её на главы по заголовкам.
// Шапка страницы (#headertemplate) с автором, годом и навигацией в текст не идёт.
//
// Часть функций работает только со строками (без DOM) — их же использует tools/build-catalog.mjs в Node.

const API = "https://ru.wikisource.org/w/api.php";
export const WIKI = "https://ru.wikisource.org/wiki/";
const IN_NODE = typeof window === "undefined";
const PARALLEL = 3;          // сколько глав качаем одновременно (Викимедиа просит не больше 3)
const MAX_DEPTH = 3;         // книга → том → часть → глава

// ---------- запросы ----------

// один запрос к API Викитеки; ошибки сети превращаются в понятный текст
export async function api(params, tries = 6) {
  const url = API + "?" + new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params });
  // Node обязан представиться (иначе лимит 10 запросов в минуту); браузер представляется сам — 200 в минуту
  const opts = IN_NODE ? { headers: { "User-Agent": "chitalka-catalog/1.0 (https://github.com/Roman63390433/4italka)" } } : {};
  for (let i = 1; ; i++) {
    let res;
    try { res = await fetch(url, opts); }
    catch {
      if (i < tries) { await pause(1000 * i); continue; }
      throw new Error("Нет связи с Викитекой. Проверьте интернет и попробуйте ещё раз.");
    }
    // 429 — «слишком часто»: ждём, сколько просит сервер (Retry-After), или 5, 10, 15… секунд
    if (res.status === 429 || res.status >= 500) {
      if (i < tries) { await pause((+res.headers.get("retry-after") || 5 * i) * 1000); continue; }
      throw new Error("Викитека сейчас перегружена или не отвечает. Попробуйте через минуту.");
    }
    if (!res.ok) throw new Error(`Викитека ответила ошибкой ${res.status}.`);
    const json = await res.json();
    if (json.error) {
      if (json.error.code === "missingtitle") throw new Error("Страница книги на Викитеке не найдена (её могли переименовать).");
      throw new Error("Викитека: " + (json.error.info || "ошибка запроса"));
    }
    return json;
  }
}
const pause = ms => new Promise(r => setTimeout(r, ms));

// ---------- разбор HTML строками (работает и в Node) ----------

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export const decodeEntities = s => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (m, d) => d === "160" ? " " : String.fromCodePoint(+d))
  .replace(/&(\w+);/g, (m, n) => ENT[n] ?? m);

// вырезать элементы целиком (с вложенными такими же тегами), открывающий тег которых подходит под re
export function cutBlocks(html, re) {
  for (let guard = 0; guard < 300; guard++) {
    const m = html.match(re);
    if (!m) break;
    const tag = (html.slice(m.index).match(/^<(\w+)/) || [])[1];
    if (!tag) break;
    const tagRe = new RegExp(`<(/?)${tag}\\b[^>]*?(/?)>`, "gi");
    tagRe.lastIndex = m.index;
    let depth = 0, end = html.length;
    for (let t; (t = tagRe.exec(html));) {
      if (t[2]) continue;                      // <div/> — ничего не открывает
      depth += t[1] ? -1 : 1;
      if (depth === 0) { end = t.index + t[0].length; break; }
    }
    html = html.slice(0, m.index) + html.slice(end);
  }
  return html;
}

// служебное оформление, которое не относится к тексту
const JUNK = [
  /<div id="headertemplate"/i,
  /<(div|table|span|ul|p)\b[^>]*class="[^"]*\b(ws-noexport|licensetemplate|navbox|metadata|noprint|mw-editsection|ws-pagenum|pagenum|mw-cite-backlink|printfooter|toc|linenumright|linenumleft|linenum)\b/i,
  /<div id="toc"/i,
  /<(style|script)\b/i,
];
export function bodyOf(html) {
  html = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const re of JUNK) html = cutBlocks(html, re);
  return html;
}

// заголовки страницы из шапки: название, автор, год, глава, статья Википедии
export function headerOf(html) {
  const span = id => {
    const m = html.match(new RegExp(`id="${id}"[^>]*>([\\s\\S]*?)</span>(?!</a>)`));
    return m ? textOf(m[1]) : "";
  };
  const authorTitle = (html.match(/id="ws-author"[^>]*>[^<]*<a [^>]*title="Автор:([^"]+)"/) || [])[1];
  const wp = (html.match(/class="menu-wiki-wiki"[\s\S]*?title="w:([^"]+)"/) || [])[1];
  return {
    title: span("ws-title"),
    subtitle: span("ws-subtitle"),
    chapter: span("ws-chapter"),
    author: authorTitle ? decodeEntities(authorTitle) : span("ws-author").replace(/^автор\s*/, "").replace(/\s*\(.*$/, ""),
    published: span("ws-published"),
    wikipedia: wp ? decodeEntities(wp) : "",
  };
}

// ссылки на страницы Викитеки по порядку в тексте (без повторов; красные ссылки сюда не попадают)
export function linksOf(html) {
  const out = [];
  const re = /<a href="\/wiki\/[^"#]*"[^>]*?title="([^"]+)"/g;
  for (let m; (m = re.exec(html));) {
    const t = decodeEntities(m[1]);
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

export const textOf = html => decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// страница: шапка, текст без шапки, категории, ссылки в тексте
export async function getPage(title) {
  const j = await api({ action: "parse", page: title, prop: "text|categories", redirects: "1",
    disableeditsection: "1", disablelimitreport: "1", disabletoc: "1" });
  const html = j.parse.text;
  const body = bodyOf(html);
  return {
    title: j.parse.title,
    header: headerOf(html),
    cats: (j.parse.categories || []).map(c => c.category.replace(/_/g, " ")),
    body,
    links: linksOf(body),
  };
}

// ---------- редакции и оглавления ----------

const isModern = t => /(\/|\()(СО|ВТ:Ё)\)?$/.test(t);        // «…/СО», «…/1969 (СО)», «…/ПСС 1989 (ВТ:Ё)»
const isOld = t => /(\/|\()ДО\)?$/.test(t);
// подстраницы, которые не главы: весь текст ещё раз одной страницей, черновые варианты, ссылки
const NOT_CHAPTER = /\/(Весь текст|Полный текст|Текст целиком|Варианты?|Черновики?|Черновая редакция|Ссылки|Сцены, исключённые[^/]*|Пояснения)$/i;
const isEditionList = p => p.cats.includes("Списки редакций");
const isPre = body => /^\s*(<div[^>]*>\s*)*<pre/.test(body);   // «сырой» текст из старых библиотек

// подстраницы этой страницы, только «листья»: если есть «Том I» и «Том I/Глава I», берём главу
export function subpagesOf(page) {
  const pre = page.title + "/";
  const subs = page.links.filter(t => t.startsWith(pre) && !isOld(t) && !isModern(t) && !NOT_CHAPTER.test(t));
  return subs.filter(t => !subs.some(o => o !== t && o.startsWith(t + "/")));
}

// главы внутри одной страницы: режем по заголовкам h2/h3 (если их хотя бы два).
// Заголовок без текста под ним («Часть первая», сразу за ним «I. Бэла») приклеиваем к названию следующей главы.
export function splitByHeadings(body) {
  const at = [];
  for (const m of body.matchAll(/<div class="mw-heading mw-heading[23]"|<h[23]\b/g)) {
    const prev = at[at.length - 1];
    // <div class="mw-heading"><h2> — это один заголовок, а не два
    if (prev !== undefined && body.slice(prev, m.index).startsWith('<div class="mw-heading') && !/<\/h[23]>/.test(body.slice(prev, m.index))) continue;
    at.push(m.index);
  }
  if (at.length < 2) return [{ title: "", html: body }];
  const parts = [];
  const lead = body.slice(0, at[0]);
  let carry = "";
  at.forEach((p, i) => {
    let html = body.slice(p, at[i + 1] ?? body.length);
    const h = html.match(/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/);
    const title = h ? textOf(h[2]).replace(/\.$/, "") : "";
    const rest = h ? html.slice(h.index + h[0].length) : html;
    if (textOf(rest).length < 40 && i < at.length - 1) { carry += (carry ? ". " : "") + title; return; }
    if (!parts.length && textOf(lead).length > 0) html = lead + html;    // текст до первого заголовка — в первую главу
    parts.push({ title: (carry ? carry + ". " : "") + title, html });
    carry = "";
  });
  // почти пустой кусок (заголовок «Деревня» + подзаголовок) приклеиваем к следующему,
  // пустой хвост («Примечания», «См. также» — сноски уже унесены) отбрасываем
  for (let i = parts.length - 1; i >= 0; i--) {
    if (textOf(parts[i].html).length >= 100) continue;
    if (i < parts.length - 1) parts[i + 1].html = parts[i].html + parts[i + 1].html;
    if (parts.length > 1) parts.splice(i, 1);
  }
  // много крошечных кусков (строфы поэмы «Мцыри», короткие стихи) — оставляем одной главой
  const total = parts.reduce((s, p) => s + textOf(p.html).length, 0);
  if (parts.length > 8 && total / parts.length < 2000) return [{ title: "", html: body }];
  return parts;
}

/**
 * Найти страницу книги (нужную редакцию) и её подстраницы-главы.
 * Возвращает { root, header, wikipedia, cats, page (если книга на одной странице) | null, subs: [имена подстраниц] }
 */
export async function resolveBook(pageName) {
  let page = await getPage(pageName);
  const rootCats = page.cats;
  const rootHeader = page.header;
  if (isEditionList(page) || !textOf(page.body) && page.links.some(isModern)) {
    const eds = page.links.filter(t => t.startsWith(page.title + "/") && isModern(t));
    // редакция СО с оглавлением (по главам) лучше; иначе первая с нормальным текстом
    let found = null;
    for (const ed of eds) {
      const p = await getPage(ed);
      if (subpagesOf(p).length) { found = p; break; }
      if (!found && textOf(p.body).length > 500 && !isPre(p.body)) found = p;
    }
    if (!found) throw new Error("На Викитеке нет этой книги в современной орфографии.");
    page = found;
  }
  // если сам текст книги лежит на этой странице («Борис Годунов»), подстраницы — лишь приложения к нему
  const own = textOf(page.body.replace(/<a [^>]*>[\s\S]*?<\/a>/g, "")).length;    // без текста ссылок оглавления
  const subs = own > 20000 ? [] : subpagesOf(page);
  return {
    root: page.title,
    header: page.header.title ? page.header : rootHeader,
    wikipedia: page.header.wikipedia || rootHeader.wikipedia,
    cats: [...new Set([...page.cats, ...rootCats])],
    page: subs.length ? null : page,       // книга на одной странице
    subs,
  };
}

/**
 * Скачать все главы по порядку. onPage(готово, всего).
 * Возвращает { book, chapters: [{ title, html }] }
 */
export async function collectChapters(pageName, onPage = () => {}) {
  const book = await resolveBook(pageName);
  if (book.page) {
    onPage(1, 1);
    return { book, single: true, chapters: splitByHeadings(book.page.body).map(c => ({ ...c, title: c.title || book.header.title })) };
  }
  const relTitle = t => t.slice(book.root.length + 1).split("/").join(". ");
  // очередь страниц; если страница оказалась оглавлением (том, часть) — её подстраницы встают сразу за ней
  const queue = book.subs.map(t => ({ page: t, depth: 1 }));
  const seen = new Set([book.root, ...book.subs]);
  let finished = 0;

  async function load(item) {
    const p = await getPage(item.page);
    const subs = subpagesOf(p).filter(t => !seen.has(t));
    if (subs.length && item.depth < MAX_DEPTH && textOf(p.body).length < 3000 + subs.length * 200) {
      subs.forEach(t => seen.add(t));
      queue.splice(queue.indexOf(item) + 1, 0, ...subs.map(t => ({ page: t, depth: item.depth + 1 })));
      item.container = true;
    } else item.body = p.body;
    finished++;
    onPage(finished, queue.length);
  }

  // простой «пул»: не больше PARALLEL запросов одновременно; каждый берёт первую ещё не начатую страницу
  async function worker() {
    for (let item; (item = queue.find(q => !q.started));) {
      item.started = true;
      await load(item);
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));

  const chapters = queue.filter(q => !q.container).map(q => ({ title: relTitle(q.page), html: q.body }));
  if (!chapters.length) throw new Error("Не удалось найти главы книги на Викитеке.");
  return { book, chapters };
}

// «Николай Васильевич Гоголь» → «Николай Гоголь»
export function shortAuthor(full) {
  const w = (full || "").trim().split(/\s+/);
  return w.length === 3 ? w[0] + " " + w[2] : w.join(" ");
}

// ---------- чистка HTML и сборка fb2 (только в браузере: нужен DOMParser) ----------

const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

const INLINE = { i: "emphasis", em: "emphasis", b: "strong", strong: "strong", sup: "sup", sub: "sub",
  s: "strikethrough", del: "strikethrough", strike: "strikethrough", code: "code", tt: "code" };
const BLOCKS = new Set(["p", "div", "center", "blockquote", "table", "tbody", "thead", "tr", "td", "th", "ul", "ol",
  "li", "dl", "dd", "dt", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "pre", "poem", "section", "figure"]);
const HAS_BLOCK = "p, div, h1, h2, h3, h4, h5, h6, table, ul, ol, blockquote, pre, br";

// одна глава: HTML Викитеки → кусок fb2 (<section>…</section>). notes — общий список сносок книги
function chapterToFb2(title, html, notes, shared = null) {
  const doc = new DOMParser().parseFromString(`<div id="root">${html}</div>`, "text/html");
  const root = doc.getElementById("root");

  // сноски: <sup class="reference"><a href="#cite_note-x">[1]</a></sup> + <li id="cite_note-x">текст</li>
  const noteText = shared || new Map();
  if (!shared) for (const li of root.querySelectorAll("li[id^='cite_note']")) noteText.set(li.id, li.querySelector(".reference-text") || li);
  for (const sup of root.querySelectorAll("sup.reference")) {
    const id = (sup.querySelector("a")?.getAttribute("href") || "").replace(/^#/, "");
    const src = noteText.get(id);
    if (!src) { sup.remove(); continue; }
    const n = notes.length + 1;
    notes.push(`<section id="n${n}"><title><p>${n}</p></title>${blocks(src) || "<p></p>"}</section>`);
    const a = doc.createElement("fb2note");
    a.setAttribute("n", n);
    sup.replaceWith(a);
  }
  root.querySelectorAll("ol.references, .references, .mw-references-wrap, .reflist").forEach(e => e.remove());
  root.querySelectorAll("img, figure, .thumb, .mw-empty-elt, .reference, .ws-noexport, sup.noprint").forEach(e => e.remove());
  // пустой заголовок «Примечания» в конце главы (сами сноски уже унесены в конец книги)
  for (const h of root.querySelectorAll("h2, h3, h4")) {
    if (/^(примечания|комментарии|сноски)/i.test(h.textContent.trim())) {
      const box = h.closest(".mw-heading") || h;
      let sib = box.nextSibling, rest = "";
      while (sib) { rest += sib.textContent || ""; sib = sib.nextSibling; }
      if (!rest.trim()) box.remove();
    }
  }
  // заголовок в тексте, повторяющий название главы, не дублируем
  const firstH = root.querySelector("h1, h2, h3, h4, h5");
  const same = s => s.trim().replace(/\.$/, "").toLowerCase();
  if (firstH && title.toLowerCase().endsWith(same(firstH.textContent))) (firstH.closest(".mw-heading") || firstH).remove();

  const inner = blocks(root);
  if (!inner && /^(примечания|комментарии|сноски|см. также|ссылки)/i.test(title)) return "";   // раздел только со сносками
  return `<section><title><p>${esc(title)}</p></title>${inner || "<empty-line/>"}</section>`;
}

// блочное содержимое узла → абзацы fb2
function blocks(node) {
  const out = [];
  let line = "";
  const flush = () => { const t = line.trim(); if (t) out.push(`<p>${t}</p>`); line = ""; };

  for (const c of node.childNodes) {
    if (c.nodeType === 3) { line += esc(c.nodeValue.replace(/\s+/g, " ")); continue; }
    if (c.nodeType !== 1) continue;
    const tag = c.localName;
    if (tag === "br") { flush(); continue; }
    // строчный тег (span, font…) с абзацами внутри — разбираем как блок
    if (!BLOCKS.has(tag) && !isPoem(c) && !c.querySelector(HAS_BLOCK)) { line += inline(c); continue; }
    flush();
    if (isPoem(c)) { out.push(poem(c)); continue; }
    if (/^h[1-6]$/.test(tag)) { const t = inline(c).trim(); if (t) out.push(`<subtitle>${t}</subtitle>`); continue; }
    if (tag === "pre") { for (const l of c.textContent.split("\n")) if (l.trim()) out.push(`<p>${esc(l.trim())}</p>`); continue; }
    if (tag === "hr") { out.push("<subtitle>* * *</subtitle>"); continue; }
    if (tag === "blockquote") { const b = blocks(c); if (b) out.push(`<cite>${b}</cite>`); continue; }
    if (tag === "p") {
      // абзац со строками через <br>: короткие строки — это стихи внутри прозы, каждая отдельно;
      // длинные — проза, порезанная по ширине старой библиотеки (lib.ru), склеиваем обратно
      if (c.querySelector("br")) {
        const brs = c.querySelectorAll("br").length;
        if (c.textContent.length / (brs + 1) > 60) { const t = inline(c).trim(); if (t) out.push(`<p>${t}</p>`); }
        else out.push(poem(c));
      }
      else { const t = inline(c).trim(); if (t) out.push(`<p>${t}</p>`); }
      continue;
    }
    if (tag === "li") { const t = inline(c).trim(); if (t) out.push(`<p>${c.parentNode?.localName === "ol" ? "" : "• "}${t}</p>`); continue; }
    if (tag === "tr") {
      // таблица-«рамка» для оформления (так часто сверстаны стихи) — содержимое ячеек как обычный текст
      if (c.querySelector(HAS_BLOCK)) { for (const td of c.children) out.push(blocks(td)); continue; }
      const cells = [...c.children].map(td => inline(td).trim()).filter(Boolean);
      if (cells.length) out.push(`<p>${cells.join(" — ")}</p>`);
      continue;
    }
    out.push(blocks(c));
  }
  flush();
  return out.join("");
}

// строчное содержимое → текст fb2 с курсивом, жирным и сносками
function inline(node) {
  let s = "";
  for (const c of node.childNodes) {
    if (c.nodeType === 3) { s += esc(c.nodeValue.replace(/\s+/g, " ")); continue; }
    if (c.nodeType !== 1) continue;
    const tag = c.localName;
    if (tag === "fb2note") { const n = c.getAttribute("n"); s += `<a l:href="#n${n}" type="note">[${n}]</a>`; continue; }
    if (tag === "br") { s += " "; continue; }
    const inner = inline(c);
    if (INLINE[tag] && inner.trim()) s += `<${INLINE[tag]}>${inner}</${INLINE[tag]}>`;
    else s += inner;
  }
  return s;
}

// стихи: <div class="poem"><p>строка<br>строка</p>…</div>; пустая строка — новая строфа
const isPoem = el => el.localName === "poem" || el.classList?.contains("poem");
function poem(el) {
  const items = [];          // строфы и подзаголовки по порядку
  let lines = [];
  let cur = "";
  let blank = 0;             // сколько переводов строки подряд без текста: «строка<br>\n<br>» — это пустая строка
  const end = () => { if (lines.length) items.push(`<stanza>${lines.map(v => `<v>${v}</v>`).join("")}</stanza>`); lines = []; blank = 0; };
  const push = () => {
    const t = cur.trim();
    cur = "";
    if (t) { lines.push(t); blank = 0; } else if (++blank >= 2) end();
  };
  (function walk(n) {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) {
        c.nodeValue.split("\n").forEach((p, i) => { if (i) push(); cur += esc(p.replace(/\s+/g, " ")); });
        continue;
      }
      if (c.nodeType !== 1) continue;
      const tag = c.localName;
      if (tag === "br") { push(); continue; }
      if (tag === "p" || tag === "div") { if (cur.trim()) push(); walk(c); push(); end(); continue; }
      if (/^h[1-6]$/.test(tag)) { push(); end(); const t = inline(c).trim(); if (t) items.push(`<subtitle>${t}</subtitle>`); continue; }
      if (tag === "fb2note") { cur += `<a l:href="#n${c.getAttribute("n")}" type="note">[${c.getAttribute("n")}]</a>`; continue; }
      cur += INLINE[tag] ? `<${INLINE[tag]}>${inline(c)}</${INLINE[tag]}>` : inline(c);
    }
  })(el);
  push(); end();
  // в fb2 подзаголовок не может стоять первым в <poem> — такие выносим перед стихотворением
  const lead = [];
  while (items.length && !items[0].startsWith("<stanza>")) lead.push(items.shift());
  return lead.join("") + (items.length ? `<poem>${items.join("")}</poem>` : "");
}

const FB2_GENRE = g => /стих|поэм|баллад|басн/i.test(g) ? "poetry" : /пьес|комеди|драм|трагеди/i.test(g) ? "dramaturgy" : "prose_rus_classic";

/**
 * Скачать книгу из каталога (запись data/catalog.json) и собрать файл fb2.
 * onProgress(готово, всего) — по главам.
 * @returns {Promise<File>}
 */
export async function fetchBook(entry, onProgress = () => {}) {
  const { book, chapters, single } = await collectChapters(entry.page, onProgress);
  const notes = [];
  // книга на одной странице: список сносок лежит в своём разделе («Примечания»), а значки сносок — по всем главам
  let shared = null;
  if (single) {
    shared = new Map();
    const all = new DOMParser().parseFromString(chapters.map(c => c.html).join(""), "text/html");
    for (const li of all.querySelectorAll("li[id^='cite_note']")) shared.set(li.id, li.querySelector(".reference-text") || li);
  }
  const sections = chapters.map(c => chapterToFb2(c.title, c.html, notes, shared)).filter(Boolean);
  if (sections.join("").replace(/<[^>]+>/g, "").trim().length < 50) throw new Error("Текст книги на Викитеке пуст или не распознан.");

  const author = entry.author || shortAuthor(book.header.author);
  const words = author.split(/\s+/);
  const last = words.pop() || "";
  const title = entry.title || book.header.title || entry.page;
  const src = WIKI + encodeURI(book.root.replace(/ /g, "_"));
  const today = new Date().toISOString().slice(0, 10);

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
<description>
<title-info><genre>${FB2_GENRE(entry.genre || "")}</genre><author><first-name>${esc(words.join(" "))}</first-name><last-name>${esc(last)}</last-name></author><book-title>${esc(title)}</book-title>${entry.description ? `<annotation><p>${esc(entry.description)}</p></annotation>` : ""}${entry.year ? `<date>${entry.year}</date>` : ""}<lang>ru</lang></title-info>
<document-info><author><nickname>Читалка</nickname></author><program-used>Читалка (Викитека → fb2)</program-used><date value="${today}">${today}</date><src-url>${esc(src)}</src-url><id>${esc(entry.id || "ws-" + today)}</id><version>1.0</version></document-info>
</description>
<body><title><p>${esc(author)}</p><p>${esc(title)}</p></title>
${sections.join("\n")}
</body>${notes.length ? `\n<body name="notes"><title><p>Примечания</p></title>${notes.join("")}</body>` : ""}
</FictionBook>`;

  const name = title.replace(/[\\/:*?"<>|]/g, "").slice(0, 80) + ".fb2";
  return new File([xml], name, { type: "application/x-fictionbook+xml" });
}
