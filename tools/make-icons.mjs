// Рисует значок приложения (раскрытая книга со звездой на кремовой плитке) и делает из него PNG.
// Запуск: node tools/make-icons.mjs  → icons/icon.svg, icons/icon-maskable.svg, icons/icon-192.png,
// icons/icon-512.png, icons/icon-maskable-512.png. PNG рисует Chrome без окна (headless).
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const OUT = resolve("icons");

// звезда с четырьмя лучами; k — насколько «вдавлены» стороны (0 — ромб)
function star(cx, cy, r, k = 0.13) {
  const c = r * k;
  return `M${cx} ${cy - r}Q${cx + c} ${cy - c} ${cx + r} ${cy}Q${cx + c} ${cy + c} ${cx} ${cy + r}` +
    `Q${cx - c} ${cy + c} ${cx - r} ${cy}Q${cx - c} ${cy - c} ${cx} ${cy - r}Z`;
}

// раскрытая книга: обложка, срез страниц и два разворота; рисуется вокруг точки (256, y)
function book(y) {
  const page = `M256 ${y - 58}C214 ${y - 86} 158 ${y - 90} 112 ${y - 76}V${y + 62}C158 ${y + 50} 214 ${y + 54} 256 ${y + 80}Z`;
  const cover = `M256 ${y - 20}C200 ${y - 50} 144 ${y - 56} 104 ${y - 50}Q96 ${y - 49} 96 ${y - 40}V${y + 90}C152 ${y + 80} 210 ${y + 82} 256 ${y + 104}Z`;
  const left = `
    <path d="${cover}" fill="url(#cover)"/>
    <path d="M104 ${y + 72}C156 ${y + 61} 212 ${y + 66} 256 ${y + 94}V${y + 80}C214 ${y + 54} 158 ${y + 50} 112 ${y + 62}Z" fill="#d6b48c"/>
    <path d="M108 ${y + 67}C157 ${y + 56} 213 ${y + 60} 256 ${y + 87}" fill="none" stroke="#b08860" stroke-width="1.6"/>
    <path d="${page}" fill="url(#pageL)"/>
    <path d="M250 ${y - 52}C222 ${y - 70} 186 ${y - 76} 150 ${y - 74}" fill="none" stroke="#e4d2b2" stroke-width="2"/>`;
  return `<g>${left}</g><g transform="translate(512 0) scale(-1 1)">${left.replace(/url\(#pageL\)/, "url(#pageR)")}</g>
    <path d="M256 ${y - 58}V${y + 80}" stroke="#b7926c" stroke-width="2.5"/>`;
}

// tile — плитка со скруглёнными углами (обычный значок) или во весь квадрат (maskable: Android сам обрежет)
function svg(maskable) {
  const s = maskable ? 0.82 : 1;                    // maskable: всё содержимое внутри «безопасного круга»
  const t = (256 * (1 - s)).toFixed(1);
  const frameInset = 42, fr = 78;
  const mid = 256, a = frameInset, b = 512 - frameInset;
  const gap = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="13" fill="url(#bg)"/><path d="${star(cx, cy, 15)}" fill="#a98463"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="512"><stop offset="0" stop-color="#f6ecda"/><stop offset="1" stop-color="#e9d9bc"/></linearGradient>
    <radialGradient id="glow" cx=".5" cy=".42" r=".6"><stop offset="0" stop-color="#fffaf0" stop-opacity=".75"/><stop offset="1" stop-color="#fffaf0" stop-opacity="0"/></radialGradient>
    <linearGradient id="cover" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a5538"/><stop offset="1" stop-color="#5a3c27"/></linearGradient>
    <linearGradient id="pageL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f3e7d1"/><stop offset=".85" stop-color="#fbf5e9"/><stop offset="1" stop-color="#e8d6b8"/></linearGradient>
    <linearGradient id="pageR" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#efe1c8"/><stop offset=".85" stop-color="#f8f0e1"/><stop offset="1" stop-color="#e3d0b0"/></linearGradient>
    <linearGradient id="starG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a6243"/><stop offset="1" stop-color="#6a4730"/></linearGradient>
  </defs>
  ${maskable ? `<rect width="512" height="512" fill="url(#bg)"/>` : `<rect x="6" y="6" width="500" height="500" rx="112" fill="url(#bg)" stroke="#d8c3a0" stroke-width="2"/>`}
  <g transform="translate(${t} ${t}) scale(${s})">
    <rect x="${a}" y="${a}" width="${b - a}" height="${b - a}" rx="${fr}" fill="none" stroke="#c2a582" stroke-width="2.5"/>
    ${gap(mid, a)}${gap(mid, b)}${gap(a, mid)}${gap(b, mid)}
    <path d="${star(256, 156, 46, 0.12)}" fill="url(#starG)"/>
    ${book(300)}
  </g>
  <rect width="512" height="512" fill="url(#glow)" opacity=".55"/>
</svg>`;
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "icon.svg"), svg(false));
writeFileSync(join(OUT, "icon-maskable.svg"), svg(true));

const CHROME = ["C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"];
const tmp = join(tmpdir(), "chitalka-icons");
mkdirSync(tmp, { recursive: true });

function png(svgName, size, outName) {
  const html = join(tmp, outName + ".html");
  writeFileSync(html, `<html><body style="margin:0;background:transparent"><img src="${pathToFileURL(join(OUT, svgName))}" width="${size}" height="${size}" style="display:block"></body></html>`);
  for (const exe of CHROME) {
    try {
      execFileSync(exe, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--default-background-color=00000000",
        `--window-size=${size},${size}`, `--screenshot=${join(OUT, outName)}`, pathToFileURL(html).href], { stdio: "ignore" });
      return;
    } catch { /* пробуем следующий браузер */ }
  }
  throw new Error("Не нашёл Chrome или Edge для отрисовки PNG");
}

png("icon.svg", 192, "icon-192.png");
png("icon.svg", 512, "icon-512.png");
png("icon-maskable.svg", 512, "icon-maskable-512.png");
rmSync(tmp, { recursive: true, force: true });
console.log("Значки готовы:", OUT);
