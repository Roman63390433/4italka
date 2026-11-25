// Разбивка текста на страницы. Глава выводится в CSS-колонки шириной в экран:
// одна колонка = одна страница, а «перелистнуть» = сдвинуть текст на ширину экрана.
// Модуль не знает про кнопки: ему дают элементы и книгу, он сообщает о смене страницы через onChange.

export class Paginator {
  constructor(viewport, flow, onChange) {
    this.viewport = viewport;   // окно с overflow:hidden
    this.flow = flow;           // лента с текстом главы
    this.onChange = onChange;
    this.book = null;
    this.ch = 0; this.page = 0; this.pages = 1;
    this.step = 1;
  }

  setBook(book) {
    this.book = book;
    this.before = [];            // сколько букв во всех главах до данной
    let sum = 0;
    for (const c of book.chapters) { this.before.push(sum); sum += c.chars; }
  }

  // показать главу ch на месте frac (0 — начало, 1 — конец)
  show(ch, frac = 0) {
    const n = this.book.chapters.length;
    this.ch = Math.max(0, Math.min(n - 1, ch | 0));
    this.flow.innerHTML = this.book.chapters[this.ch].html;
    this.measure();
    this.page = frac >= 1 ? this.pages - 1 : Math.min(this.pages - 1, Math.floor(frac * this.pages + 1e-6));
    this.apply();
  }

  // пересчитать страницы (после смены шрифта, размера, поворота экрана) и остаться на том же месте
  relayout() {
    if (!this.book) return;
    const frac = this.pages ? this.page / this.pages : 0;
    this.measure();
    this.page = Math.min(this.pages - 1, Math.round(frac * this.pages));
    this.apply();
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

  apply() {
    this.flow.style.transform = `translateX(${-this.page * this.step}px)`;
    this.onChange?.(this.state());
  }

  next() {
    if (this.page < this.pages - 1) { this.page++; this.apply(); return true; }
    if (this.ch < this.book.chapters.length - 1) { this.show(this.ch + 1, 0); return true; }
    return false;                               // конец книги
  }

  prev() {
    if (this.page > 0) { this.page--; this.apply(); return true; }
    if (this.ch > 0) { this.show(this.ch - 1, 1); return true; }
    return false;
  }

  // перейти к доле всей книги (для ползунка): 0..1
  goToPercent(p) {
    const target = p * this.book.chars;
    let ch = 0;
    while (ch < this.book.chapters.length - 1 && this.before[ch + 1] <= target) ch++;
    const c = this.book.chapters[ch];
    this.show(ch, c.chars ? (target - this.before[ch]) / c.chars : 0);
  }

  state() {
    const c = this.book.chapters[this.ch];
    const frac = this.page / this.pages;
    const done = this.before[this.ch] + c.chars * ((this.page + 1) / this.pages);
    // оценка страниц во всей книге: буквы книги / буквы на странице этой главы
    const perPage = Math.max(300, c.chars / this.pages);
    const bookPages = Math.max(1, Math.round(this.book.chars / perPage));
    const bookPage = Math.min(bookPages, Math.round((this.before[this.ch] + c.chars * frac) / perPage) + 1);
    return {
      ch: this.ch, page: this.page, pages: this.pages, frac,
      percent: Math.min(100, Math.round(done / this.book.chars * 100)),
      left: this.pages - this.page - 1,
      bookPage, bookPages,
      chapterTitle: c.title,
    };
  }
}
