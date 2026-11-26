// «Якорь» в тексте: место в главе = номер буквы от начала главы.
// Как ленточка-закладка между словами: шрифт, поля и режим чтения меняются, а номер буквы — нет.
// Модуль не знает про кнопки и экраны: ему дают элемент с текстом главы, он считает буквы и ищет места.

export class TextIndex {
  constructor(root) {
    this.root = root;
    this.nodes = [];     // все кусочки текста главы по порядку
    this.starts = [];    // с какой буквы начинается каждый кусочек
    let sum = 0;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      this.nodes.push(n);
      this.starts.push(sum);
      sum += n.data.length;
    }
    this.total = sum;
  }

  // место в документе (кусочек текста + сдвиг) → номер буквы
  offsetOf(node, offset) {
    const i = this.nodes.indexOf(node);
    if (i >= 0) return this.starts[i] + offset;
    // выделение может начинаться не в тексте, а на абзаце — считаем по ближайшему тексту после него
    const r = document.createRange();
    r.setStart(node, offset);
    for (let k = 0; k < this.nodes.length; k++) {
      if (r.comparePoint(this.nodes[k], 0) >= 0) return this.starts[k];
    }
    return this.total;
  }

  // номер буквы → { node, offset }
  pointAt(off) {
    off = Math.max(0, Math.min(this.total, off | 0));
    let lo = 0, hi = this.nodes.length - 1;
    while (lo < hi) {                                   // ищем последний кусочек, который начинается не позже off
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= off) lo = mid; else hi = mid - 1;
    }
    const node = this.nodes[lo];
    if (!node) return null;
    return { node, offset: Math.min(node.data.length, off - this.starts[lo]) };
  }

  // прямоугольник на экране для буквы off (или ближайшей видимой после неё)
  rectAt(off) {
    const p = this.pointAt(off);
    if (!p) return null;
    const r = document.createRange();
    let { node, offset } = p;
    let i = this.nodes.indexOf(node);
    for (let tries = 0; tries < 400 && node; tries++) {
      if (offset < node.data.length) {
        r.setStart(node, offset); r.setEnd(node, offset + 1);
        const rect = r.getClientRects()[0];
        if (rect && (rect.width || rect.height)) return rect;
        offset++;
      } else { node = this.nodes[++i]; offset = 0; }
    }
    return null;
  }

  // первая буква, которая не «до» видимой области. before(rect) — правило конкретного режима чтения
  firstVisible(before) {
    const n = this.nodes.length;
    if (!n) return 0;
    const r = document.createRange();
    const lastRect = node => { r.selectNodeContents(node); const rs = r.getClientRects(); return rs[rs.length - 1]; };
    // 1) кусочек: первый, у которого последняя строка не «до» экрана
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const rect = lastRect(this.nodes[mid]);
      if (rect && before(rect)) lo = mid + 1; else hi = mid;
    }
    // 2) буква внутри кусочка
    const node = this.nodes[lo];
    let a = 0, b = node.data.length;
    while (a < b) {
      const mid = (a + b) >> 1;
      r.setStart(node, mid); r.setEnd(node, mid + 1);
      const rect = r.getClientRects()[0];
      if (rect && before(rect)) a = mid + 1; else b = mid;
    }
    return this.starts[lo] + a;
  }

  // текст от буквы start до end; между абзацами и заголовками ставим пробел, чтобы слова не слипались
  text(start, end) {
    const BLOCK = "p,h1,h2,h3,h4,h5,h6,div,li,blockquote,td,th,section,tr";
    let out = "", lastBlock = null;
    this.nodes.forEach((node, i) => {
      const a = this.starts[i], b = a + node.data.length;
      if (b <= start || a >= end) return;
      const block = node.parentElement?.closest(BLOCK);
      if (out && block !== lastBlock) out += " ";
      lastBlock = block;
      out += node.data.slice(Math.max(0, start - a), Math.min(node.data.length, end - a));
    });
    return out.replace(/\s+/g, " ").trim();
  }

  // Range от буквы start до end — для подсветки и заметок
  range(start, end) {
    const a = this.pointAt(start), b = this.pointAt(end);
    if (!a || !b) return null;
    const r = document.createRange();
    r.setStart(a.node, a.offset);
    r.setEnd(b.node, b.offset);
    return r;
  }
}

// Обернуть буквы start..end в элементы-подсветки (может понадобиться несколько: отрывок идёт через абзацы).
// make() создаёт пустой элемент (например <mark>). Текст не меняется, поэтому номера букв остаются прежними,
// но кусочки текста делятся — после этого TextIndex нужно построить заново.
export function wrapRange(index, start, end, make) {
  if (end <= start) return;
  const parts = [];
  index.nodes.forEach((node, i) => {
    const a = index.starts[i], b = a + node.data.length;
    if (b <= start || a >= end || !node.data.trim()) return;
    parts.push({ node, from: Math.max(0, start - a), to: Math.min(node.data.length, end - a) });
  });
  for (const { node, from, to } of parts) {
    let piece = node;
    if (to < piece.data.length) piece.splitText(to);
    if (from > 0) piece = piece.splitText(from);
    const el = make();
    piece.parentNode.insertBefore(el, piece);
    el.appendChild(piece);
  }
}

// снять подсветки, выбранные селектором, вернув текст на место
export function unwrap(root, selector) {
  root.querySelectorAll(selector).forEach(el => {
    const parent = el.parentNode;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    el.remove();
    parent.normalize();
  });
}
