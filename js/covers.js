// Обложки книг для полки и карточек серий: картинка из книги или нарисованная (цвет + автор + название).
// Ссылки на картинки (blob:) живут, пока полка не перерисована, — releaseCovers() их освобождает.
let coverUrls = [];

export function releaseCovers() {
  coverUrls.forEach(u => URL.revokeObjectURL(u));
  coverUrls = [];
}

// цвет нарисованной обложки — постоянный для каждой книги
const PALETTE = ["#2d4a5a", "#6b3b2e", "#3d4d36", "#5a4a2e", "#40344f", "#5e6b46", "#a4635d", "#7a5a48"];
const colorFor = s => PALETTE[[...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length];

// size: "" — обычная, "big" — для «Продолжить», "small" — для карточки серии
// у книги «хочу прочитать» (без файла) обложка может быть ссылкой coverUrl, если сайт не дал скачать картинку
export function coverEl(b, size = "") {
  const el = document.createElement("div");
  el.className = "cover" + (size ? " " + size : "") + (b.wish ? " wish" : "");
  if (b.cover || b.coverUrl) {
    let url = b.coverUrl;
    if (b.cover) { url = URL.createObjectURL(b.cover); coverUrls.push(url); }
    const img = document.createElement("img");
    img.src = url; img.alt = "";
    if (!b.cover) {
      img.referrerPolicy = "no-referrer";
      img.onerror = () => el.replaceWith(coverEl({ ...b, cover: null, coverUrl: "" }, size));   // нет интернета — рисуем свою
    }
    el.classList.add("has-img");
    el.appendChild(img);
  } else {
    el.style.background = colorFor(b.title);
    const a = document.createElement("span"); a.className = "c-a"; a.textContent = (b.author || "").split(/[ ,]/).filter(Boolean).pop() || "";
    const t = document.createElement("span"); t.className = "c-t"; t.textContent = b.title;
    const m1 = document.createElement("span"); m1.className = "c-mark";
    el.append(a, m1, t, m1.cloneNode());
  }
  return el;
}

// долгое нажатие (полсекунды): fn вызывается, а обычный «клик» после него гасится
export function longPress(el, fn) {
  let timer = null, fired = false, x0 = 0, y0 = 0;
  const stop = () => { clearTimeout(timer); timer = null; };
  el.addEventListener("pointerdown", e => {
    fired = false; x0 = e.clientX; y0 = e.clientY;
    timer = setTimeout(() => { fired = true; navigator.vibrate?.(15); fn(); }, 500);
  });
  el.addEventListener("pointermove", e => { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) stop(); });
  for (const t of ["pointerup", "pointercancel", "pointerleave"]) el.addEventListener(t, stop);
  el.addEventListener("click", e => { if (fired) { e.preventDefault(); e.stopImmediatePropagation(); fired = false; } }, true);
  el.addEventListener("contextmenu", e => e.preventDefault());   // своё меню браузера на долгое нажатие не нужно
}
