// Панели снизу, вопросы и подсказки — вместо системных alert/confirm.
// «Слои» связаны с историей браузера: системная кнопка «назад» на Android закрывает верхний слой
// (панель, потом экран чтения), а не выходит из приложения.

const layers = [];            // [{ name, close }]
const $ = id => document.getElementById(id);

export function pushLayer(name, close) {
  layers.push({ name, close });
  history.pushState({ layer: name, depth: layers.length }, "");
}

// закрыть верхний слой «как будто нажали назад»
export function back() { if (layers.length) history.back(); }

// закрываем все слои глубже текущей записи истории (на случай, если «назад» нажали несколько раз подряд)
window.addEventListener("popstate", e => {
  const depth = e.state?.depth || 0;
  while (layers.length > depth) layers.pop().close();
});

export const hasLayer = name => layers.some(l => l.name === name);

// ---- панели ----
let openSheetEl = null;

export function openSheet(id, onClose = null) {
  const replacing = !!openSheetEl;       // одна панель сменяет другую — запись в истории та же
  if (replacing) {
    const old = openSheetEl, cb = old._onClose;
    old._onClose = null;
    old.classList.remove("open");
    old.hidden = true;
    cb?.();
  }
  const el = $(id);
  el.hidden = false;
  el.scrollTop = 0;
  $("backdrop").hidden = false;
  void el.offsetHeight;                  // заставляем браузер сначала нарисовать панель внизу, потом выдвинуть
  el.classList.add("open");
  $("backdrop").classList.add("open");
  el._onClose = onClose;
  openSheetEl = el;
  if (!replacing) pushLayer("sheet", closeSheetNow);
}

let closedWaiters = [];
function closeSheetNow() {
  const el = openSheetEl;
  closedWaiters.forEach(f => f()); closedWaiters = [];
  if (!el) return;
  openSheetEl = null;
  const cb = el._onClose; el._onClose = null; cb?.();
  el.classList.remove("open");
  $("backdrop").classList.remove("open");
  setTimeout(() => { if (openSheetEl !== el) el.hidden = true; if (!openSheetEl) $("backdrop").hidden = true; }, 220);
}

// закрыть панель; Promise выполнится, когда она действительно закрыта (история браузера отвечает не сразу)
export function closeSheet() {
  if (!openSheetEl) return Promise.resolve();
  const done = new Promise(r => closedWaiters.push(r));
  if (layers.at(-1)?.name === "sheet") back();
  else closeSheetNow();                 // запасной путь, если история разошлась со слоями
  return done;
}

$("backdrop").addEventListener("click", closeSheet);

// свайп вниз по панели закрывает её
document.querySelectorAll(".sheet").forEach(el => {
  let y0 = null;
  el.addEventListener("touchstart", e => { if (el.scrollTop <= 0) y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener("touchend", e => {
    if (y0 !== null && e.changedTouches[0].clientY - y0 > 70) closeSheet();
    y0 = null;
  });
});

// ---- вопрос с кнопками: await ask("Удалить?", [{id:"del", text:"Удалить", danger:true}]) ----
export function ask(text, buttons) {
  return new Promise(resolve => {
    let answered = false;
    $("askText").textContent = text;
    const box = $("askBtns");
    box.innerHTML = "";
    for (const b of [...buttons, { id: null, text: "Отмена" }]) {
      const btn = document.createElement("button");
      btn.textContent = b.text;
      btn.className = b.danger ? "danger" : b.id ? "primary" : "secondary";
      btn.onclick = async () => { answered = true; await closeSheet(); resolve(b.id); };
      box.appendChild(btn);
    }
    // закрыли свайпом, тапом мимо или «назад» — считаем «Отмена»
    openSheet("askSheet", () => { if (!answered) resolve(null); });
  });
}

// ---- короткая подсказка внизу экрана; action — необязательная кнопка { text, fn } («Вернуть») ----
let toastTimer;
export function toast(msg, ms = 3200, action = null) {
  const t = $("toast");
  t.textContent = msg;
  if (action) {
    const b = document.createElement("button");
    b.textContent = action.text;
    b.onclick = () => { t.classList.remove("show"); action.fn(); };
    t.appendChild(b);
  }
  t.classList.toggle("has-action", !!action);
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}
