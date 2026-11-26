// Режим «страницы». Глава выводится в CSS-колонки шириной в экран:
// одна колонка = одна страница, а «перелистнуть» = сдвинуть текст на ширину экрана.
// Место хранится якорем (номер первой буквы на странице), поэтому после смены шрифта открывается та же фраза.
import { BookView } from "./view.js";
import { TextIndex } from "./anchor.js";

export class Paginator extends BookView {
  constructor(viewport, flow, onChange) {
    super(viewport, flow, onChange);
    this.page = 0; this.pages = 1; this.step = 1;
  }

  attach() { this.flow.innerHTML = ""; }

  detach() {
    this.flow.innerHTML = "";
    for (const p of ["columnWidth", "columnGap", "width", "transform"]) this.flow.style[p] = "";
  }

  // показать главу ch с места at ({ off } / { frac } / { end })
  show(ch, at = {}) {
    this.ch = this.clampCh(ch);
    this.flow.innerHTML = this.book.chapters[this.ch].html;
    this.index = new TextIndex(this.flow);
    this.measure();
    if (at.end) { this.page = this.pages - 1; this.apply(); return; }
    this.off = this.offsetFor(this.index, at);
    this.page = this.pageOf(this.off);
    this.apply(false);                          // якорь оставляем ровно тем, что просили
  }

  // пересчитать страницы (шрифт, размер, поворот экрана) и остаться на той же букве
  relayout() {
    if (!this.book || !this.index) return;
    this.measure();
    this.page = this.pageOf(this.off);
    this.apply(false);
  }

  measure() {
    const w = this.viewport.clientWidth;
    const st = getComputedStyle(this.viewport);
    const pad = parseFloat(st.paddingLeft) + parseFloat(st.paddingRight);
    const colW = w - pad;
    this.flow.style.columnWidth = colW + "px";
    this.flow.style.columnGap = pad + "px";
    this.flow.style.width = colW + "px";
    this.flow.style.transform = "none";
    this.step = w;                              // ширина колонки + промежуток = ширина экрана
    this.pages = Math.max(1, Math.round((this.flow.scrollWidth + pad) / this.step));
  }

  // на какой странице буква off
  pageOf(off) {
    const rect = this.index.rectAt(off);
    if (!rect) return off >= this.index.total ? this.pages - 1 : 0;
    const x = rect.left - this.flow.getBoundingClientRect().left;   // не зависит от сдвига ленты
    return Math.max(0, Math.min(this.pages - 1, Math.floor((x + 2) / this.step)));
  }

  // первая буква на текущей странице
  firstOnPage() {
    const left = this.flow.getBoundingClientRect().left, start = this.page * this.step;
    return this.index.firstVisible(r => r.left - left < start - 2);
  }

  apply(updateAnchor = true) {
    this.flow.style.transform = `translateX(${-this.page * this.step}px)`;
    if (updateAnchor) this.off = this.firstOnPage();
    this.onChange?.(this.state());
  }

  next() {
    if (this.page < this.pages - 1) { this.page++; this.apply(); return true; }
    if (this.ch < this.book.chapters.length - 1) { this.show(this.ch + 1, { off: 0 }); return true; }
    return false;                               // конец книги
  }

  prev() {
    if (this.page > 0) { this.page--; this.apply(); return true; }
    if (this.ch > 0) { this.show(this.ch - 1, { end: true }); return true; }
    return false;
  }

  // элемент с текстом главы ch, если она сейчас на экране (для подсветки заметок)
  rootOf(ch) { return ch === this.ch ? this.flow : null; }
  indexOf(ch) { return ch === this.ch ? this.index : null; }

  state() { return this.makeState(this.page, this.pages, this.index?.total || 0); }
}
