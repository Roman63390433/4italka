// Режим «лента»: текст прокручивается пальцем сверху вниз, как веб-страница.
// На экране держим 2–4 главы подряд: дочитали до конца — снизу подгружается следующая,
// поднялись к началу — сверху предыдущая. Место — тот же якорь (глава + номер буквы), что и в режиме страниц.
import { BookView, nextFrame } from "./view.js";
import { TextIndex } from "./anchor.js";

const KEEP = 4;                                 // сколько глав держать на экране одновременно

export class Scroller extends BookView {
  constructor(viewport, flow, onChange) {
    super(viewport, flow, onChange);
    this.onScroll = () => {
      if (this.raf) return;
      this.raf = true;
      nextFrame(() => { this.raf = false; this.scrolled(); });
    };
  }

  attach() {
    this.flow.innerHTML = "";
    this.viewport.addEventListener("scroll", this.onScroll, { passive: true });
  }

  detach() {
    this.viewport.removeEventListener("scroll", this.onScroll);
    this.flow.innerHTML = "";
    this.viewport.scrollTop = 0;
  }

  sections() { return [...this.flow.children]; }
  sec(ch) { return this.flow.querySelector(`section[data-ch="${ch}"]`); }

  makeSection(ch) {
    const s = document.createElement("section");
    s.className = "chap";
    s.dataset.ch = ch;
    s.innerHTML = this.book.chapters[ch].html;
    this.decorate?.(s, ch);
    s._index = new TextIndex(s);
    return s;
  }

  // верх области текста на экране
  top() {
    const r = this.viewport.getBoundingClientRect();
    return r.top + parseFloat(getComputedStyle(this.viewport).paddingTop);
  }

  show(ch, at = {}) {
    this.ch = this.clampCh(ch);
    this.flow.innerHTML = "";
    const s = this.makeSection(this.ch);
    this.flow.appendChild(s);
    this.fill();
    if (at.end) {
      // конец главы — внизу экрана
      this.viewport.scrollTop += s.getBoundingClientRect().bottom - this.viewport.getBoundingClientRect().bottom;
      this.update();
      return;
    }
    this.off = this.offsetFor(s._index, at);
    this.scrollToAnchor();
    this.prependIfNeeded();
    this.onChange?.(this.state());
  }

  // прокрутить так, чтобы буква-якорь оказалась в первой строке
  scrollToAnchor() {
    const s = this.sec(this.ch);
    if (!s) return;
    const rect = s._index.rectAt(this.off);
    const y = rect ? rect.top : s.getBoundingClientRect().top;
    this.viewport.scrollTop += y - this.top();
  }

  // после смены шрифта текст сам перестроился — возвращаемся к той же букве
  relayout() {
    if (!this.book || !this.flow.firstChild) return;
    this.scrollToAnchor();
    this.onChange?.(this.state());
  }

  // подгрузить следующие главы, пока снизу мало текста
  fill() {
    const vp = this.viewport;
    let last = this.sections().at(-1);
    while (last && +last.dataset.ch < this.book.chapters.length - 1 &&
           vp.scrollHeight - (vp.scrollTop + vp.clientHeight) < vp.clientHeight * 1.5) {
      last = this.makeSection(+last.dataset.ch + 1);
      this.flow.appendChild(last);
    }
  }

  // подгрузить предыдущую главу сверху, не сдвигая видимый текст
  prependIfNeeded() {
    const vp = this.viewport, first = this.sections()[0];
    if (!first || +first.dataset.ch === 0 || vp.scrollTop > vp.clientHeight) return;
    const h = vp.scrollHeight;
    this.flow.insertBefore(this.makeSection(+first.dataset.ch - 1), first);
    vp.scrollTop += vp.scrollHeight - h;
  }

  // убрать дальние главы, чтобы страница не разрасталась
  trim() {
    const vp = this.viewport;
    let secs = this.sections();
    while (secs.length > KEEP) {
      const first = secs[0], last = secs.at(-1);
      if (Math.abs(+first.dataset.ch - this.ch) >= Math.abs(+last.dataset.ch - this.ch)) {
        const h = vp.scrollHeight;
        first.remove();
        vp.scrollTop -= h - vp.scrollHeight;
      } else last.remove();
      secs = this.sections();
    }
  }

  scrolled() {
    if (!this.book) return;
    this.fill();
    this.prependIfNeeded();
    this.trim();
    this.update();
  }

  // какая глава и буква сейчас вверху экрана
  update() {
    const top = this.top();
    const s = this.sections().find(x => x.getBoundingClientRect().bottom > top + 1) || this.sections().at(-1);
    if (!s) return;
    this.ch = +s.dataset.ch;
    this.off = s._index.firstVisible(r => r.bottom <= top + 1);
    this.onChange?.(this.state());
  }

  // «листать» касанием: на экран вниз или вверх, оставляя одну строку для ориентира
  next() {
    const vp = this.viewport;
    if (vp.scrollTop + vp.clientHeight >= vp.scrollHeight - 2 && this.ch >= this.book.chapters.length - 1) return false;
    vp.scrollBy({ top: vp.clientHeight - this.lineHeight(), behavior: "smooth" });
    return true;
  }

  prev() {
    const vp = this.viewport;
    if (vp.scrollTop <= 0 && +this.sections()[0]?.dataset.ch === 0) return false;
    vp.scrollBy({ top: -(vp.clientHeight - this.lineHeight()), behavior: "smooth" });
    return true;
  }

  lineHeight() { return parseFloat(getComputedStyle(this.flow).lineHeight) || 28; }

  rootOf(ch) { return this.sec(ch); }
  indexOf(ch) { return this.sec(ch)?._index || null; }
  reindex(ch) { const s = this.sec(ch); if (s) s._index = new TextIndex(s); }

  // видна ли буква off главы ch на экране
  isShown(ch, off) {
    const r = this.indexOf(ch)?.rectAt(off);
    if (!r) return false;
    const v = this.viewport.getBoundingClientRect();
    return r.bottom > this.top() && r.top < v.bottom;
  }

  // буквы текущей главы, видные на экране: [start, end)
  shownRange() {
    const s = this.sec(this.ch), bottom = this.viewport.getBoundingClientRect().bottom;
    const end = s ? s._index.firstVisible(r => r.top < bottom - 1) : this.off;
    return { ch: this.ch, start: this.off, end: Math.max(end, this.off) };
  }

  state() {
    const s = this.sec(this.ch);
    const h = this.viewport.clientHeight || 1;
    if (!s) return this.makeState(0, 1, 0);
    const r = s.getBoundingClientRect();
    const pages = Math.max(1, Math.ceil(r.height / h));
    const page = Math.max(0, Math.min(pages - 1, Math.floor((this.top() - r.top) / h)));
    return this.makeState(page, pages, s._index.total);
  }
}
