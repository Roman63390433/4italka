// Общая часть двух режимов чтения (страницы и лента): счёт букв по главам, проценты, переход по ползунку.
// Каждый режим — «наследник» BookView и умеет одно и то же: show, relayout, next, prev, state, anchor.
// Поэтому экрану чтения всё равно, какой режим включён.

// выполнить fn в ближайший кадр; запасной таймер — если вкладка в фоне и кадры не рисуются
export function nextFrame(fn) {
  let done = false;
  const run = () => { if (!done) { done = true; fn(); } };
  requestAnimationFrame(run);
  setTimeout(run, 60);
}

export class BookView {
  constructor(viewport, flow, onChange) {
    this.viewport = viewport;   // окно, в котором видно текст
    this.flow = flow;           // лента с текстом
    this.onChange = onChange;   // сообщить, что место в книге поменялось
    this.book = null;
    this.ch = 0;                // глава
    this.off = 0;               // якорь: номер первой видимой буквы в главе
    this.decorate = null;       // (элемент главы, номер главы) → подсветить заметки до подсчёта букв
  }

  setBook(book) {
    this.book = book;
    this.before = [];           // сколько букв во всех главах до данной
    let sum = 0;
    for (const c of book.chapters) { this.before.push(sum); sum += c.chars; }
  }

  clampCh(ch) { return Math.max(0, Math.min(this.book.chapters.length - 1, ch | 0)); }

  // откуда начинать показ главы: { off } — с буквы, { frac } — с доли главы (старые позиции), { end } — с конца
  offsetFor(index, at = {}) {
    if (at.end) return index.total;
    if (Number.isFinite(at.off)) return Math.min(index.total, Math.max(0, at.off));
    return Math.round((at.frac || 0) * index.total);
  }

  // перейти к доле всей книги (ползунок, риски закладок): 0..1
  goToPercent(p) {
    const target = p * this.book.chars;
    let ch = 0;
    while (ch < this.book.chapters.length - 1 && this.before[ch + 1] <= target) ch++;
    const c = this.book.chapters[ch];
    this.show(ch, { frac: c.chars ? (target - this.before[ch]) / c.chars : 0 });
  }

  // доля всей книги для места (ch, off), 0..1
  bookFrac(ch, off, total) {
    const c = this.book.chapters[ch];
    return (this.before[ch] + c.chars * (total ? off / total : 0)) / (this.book.chars || 1);
  }

  anchor() { return { ch: this.ch, off: this.off }; }

  // общий вид состояния; режим подставляет страницы своей главы
  makeState(page, pages, total) {
    const c = this.book.chapters[this.ch];
    const frac = this.bookFrac(this.ch, this.off, total);
    // оценка страниц во всей книге: буквы книги / буквы на странице этой главы
    const perPage = Math.max(300, c.chars / pages);
    const bookPages = Math.max(1, Math.round(this.book.chars / perPage));
    const atEnd = this.ch === this.book.chapters.length - 1 && page >= pages - 1;
    return {
      ch: this.ch, off: this.off, page, pages, frac,
      percent: atEnd ? 100 : Math.min(99, Math.round(frac * 100)),
      left: Math.max(0, pages - page - 1),
      bookPage: Math.min(bookPages, Math.round(frac * bookPages) + 1), bookPages,
      chapterTitle: c.title,
    };
  }
}
