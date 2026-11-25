// Оформление: применяет настройки к странице и рисует их переключатели
// (панель «Оформление» в читалке и выбор стиля на экране «Ещё»).
import * as S from "./settings.js";

const $ = id => document.getElementById(id);
let s = S.load();
let onLayout = () => {};

// цвет полосы браузера сверху под стиль
const BAR = { calm: "#121212", vintage: "#efe6d5", autumn: "#1a1411" };

export function initLook(relayout) {
  onLayout = relayout;
  apply();
  bind();
  draw();
}

function set(patch) {
  s = { ...s, ...patch };
  S.save(s);
  apply();
  draw();
  onLayout();
}

function apply() {
  const root = document.documentElement;
  root.dataset.style = s.style;
  const r = $("reader");
  r.dataset.page = s.page;
  r.style.setProperty("--read", S.fontCss(s.font));
  r.style.setProperty("--read-size", s.size + "px");
  r.style.setProperty("--read-lh", s.lh);
  r.style.setProperty("--margin", s.margin + "px");
  $("dimmer").style.opacity = s.dim;
  document.querySelector('meta[name="theme-color"]').content = BAR[s.style];
}

// кнопки создаём один раз, потом только переключаем «выбрано»
function bind() {
  document.querySelectorAll('[data-role="styles"]').forEach(box => {
    for (const st of S.STYLES) {
      const b = document.createElement("button");
      b.textContent = st.name;
      b.dataset.id = st.id;
      b.onclick = () => set(S.withStyle(s, st.id));
      box.appendChild(b);
    }
  });
  for (const p of S.PAGES) {
    const b = document.createElement("button");
    b.className = "chip t-" + p.id;
    b.textContent = p.name;
    b.dataset.id = p.id;
    b.onclick = () => set({ page: p.id });
    $("pageChips").appendChild(b);
  }
  $("fontBtn").onclick = () => {
    const i = S.FONTS.findIndex(f => f.id === s.font);
    set({ font: S.FONTS[(i + 1) % S.FONTS.length].id });
  };
  $("sizeDown").onclick = () => set({ size: Math.max(S.SIZE_MIN, s.size - 1) });
  $("sizeUp").onclick = () => set({ size: Math.min(S.SIZE_MAX, s.size + 1) });
  const seg = (box, values, key, labels) => values.forEach((v, i) => {
    const b = document.createElement("button");
    b.dataset.v = v;
    b.innerHTML = labels[i];
    b.setAttribute("aria-label", b.title = ["Плотно", "Обычно", "Свободно"][i]);
    b.onclick = () => set({ [key]: v });
    $(box).appendChild(b);
  });
  seg("lhSeg", S.LINE_HEIGHTS, "lh", lines([3, 4.5, 6]));
  seg("marginSeg", S.MARGINS, "margin", fields([3, 6, 9]));
  $("dimRange").oninput = e => { s.dim = e.target.value / 100; $("dimmer").style.opacity = s.dim; S.save(s); };
}

// маленькие картинки для кнопок интервала и полей
function lines(gaps) {
  return gaps.map(g => `<svg width="22" height="18" viewBox="0 0 22 18" aria-hidden="true"><g stroke="currentColor" stroke-width="1.6">
    <path d="M2 ${9 - g}h18M2 9h18M2 ${9 + g}h18"/></g></svg>`);
}
function fields(pads) {
  return pads.map(p => `<svg width="22" height="18" viewBox="0 0 22 18" aria-hidden="true"><rect x="1" y="1" width="20" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.3"/>
    <g stroke="currentColor" stroke-width="1.4"><path d="M${1 + p / 1.5} 6h${20 - p * 1.33}M${1 + p / 1.5} 9h${20 - p * 1.33}M${1 + p / 1.5} 12h${20 - p * 1.33}"/></g></svg>`);
}

function draw() {
  document.querySelectorAll('[data-role="styles"] button').forEach(b => b.classList.toggle("on", b.dataset.id === s.style));
  document.querySelectorAll("#pageChips button").forEach(b => b.classList.toggle("on", b.dataset.id === s.page));
  $("fontName").textContent = s.font;
  $("fontName").style.fontFamily = S.fontCss(s.font);
  $("fontDots").innerHTML = S.FONTS.map(f => `<i class="${f.id === s.font ? "on" : ""}"></i>`).join("");
  document.querySelectorAll("#lhSeg button").forEach(b => b.classList.toggle("on", Number(b.dataset.v) === s.lh));
  document.querySelectorAll("#marginSeg button").forEach(b => b.classList.toggle("on", Number(b.dataset.v) === s.margin));
  $("dimRange").value = Math.round(s.dim * 100);
}
