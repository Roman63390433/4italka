// Генератор завитков для стилей «Винтаж» и «Библиотека»: рисует SVG-украшения
// и вписывает их в css/style.css между метками ЗАВИТКИ-НАЧАЛО / ЗАВИТКИ-КОНЕЦ.
// Запуск из папки проекта: node tools/ornaments.mjs
import fs from "node:fs";

const enc = s => `url("data:image/svg+xml,${encodeURIComponent(s).replace(/'/g, "%27")}")`;

// угол рамки с завитком (левый верхний); остальные три — зеркальные копии
const cornerPath = `<path d='M1.5 30V12c0-6 4.5-10.5 10.5-10.5H30'/><path d='M12 1.5c-4 0-6 3-4.6 5.4 1.2 2 4.2 1.6 4.4-.6.1-1.5-1.4-2.3-2.4-1.5'/><path d='M1.5 12c0 4 3 6 5.4 4.6 2-1.2 1.6-4.2-.6-4.4-1.5-.1-2.3 1.4-1.5 2.4'/>`;
const flips = { tl: "", tr: "translate(32 0) scale(-1 1)", bl: "translate(0 32) scale(1 -1)", br: "translate(32 32) scale(-1 -1)" };
const corner = (c, k) => `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' fill='none' stroke='${c}' stroke-width='1.1' stroke-linecap='round'><g transform='${flips[k]}'>${cornerPath}</g></svg>`;

// разделитель: два завитка и ромбик посередине
const half = `<path d='M4 8h38c5 0 8-5 12.5-5 3.4 0 4.3 3.6 1.9 5-2 1.2-4.3-.4-3.3-2.2'/>`;
const divider = c => `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 140 16' fill='none' stroke='${c}' stroke-width='1.1' stroke-linecap='round'>${half}<g transform='translate(140 0) scale(-1 1)'>${half}</g><path d='M70 4.5l3.5 3.5-3.5 3.5-3.5-3.5z' fill='${c}' stroke='none'/></svg>`;

// короткий росчерк после заголовка раздела
const tail = c => `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 14' fill='none' stroke='${c}' stroke-width='1.1' stroke-linecap='round'><path d='M2 7c4 0 6-4 9.5-4 2.6 0 3.3 2.8 1.4 3.8-1.6.9-3.3-.4-2.5-1.7M11.5 7H58'/><circle cx='58' cy='7' r='1.2' fill='${c}' stroke='none'/></svg>`;

const four = (c, size) => ({
  img: ["tl", "tr", "bl", "br"].map(k => enc(corner(c, k))).join(","),
  pos: `left ${size}px top ${size}px,right ${size}px top ${size}px,left ${size}px bottom ${size}px,right ${size}px bottom ${size}px`,
});

function block(style, c, cCover, chapterAlign) {
  const s = `[data-style=${style}]`;
  const box = four(c, 6), cov = four(cCover, 3), covBig = four(cCover, 5);
  return `
/* — завитки: ${style} — */
${s} .continue,${s} .more-block{position:relative}
${s} .continue::after,${s} .sheet::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:${box.img};background-repeat:no-repeat;background-size:26px 26px;background-position:${box.pos}}
${s} .cover::after{content:"";position:absolute;inset:0;pointer-events:none;background:${cov.img};
  background-repeat:no-repeat;background-size:11px 11px;background-position:${cov.pos}}
${s} .cover.big::after{background-size:18px 18px;background-position:${covBig.pos}}
${s} .cover.has-img::after{display:none}
${s} .sec::after{content:"";flex:1;height:12px;max-width:70px;background:center left/auto 100% no-repeat ${enc(tail(c))}}
${s} .tabbar::before{content:"";position:absolute;left:50%;top:-8px;width:150px;height:16px;transform:translateX(-50%);background:${enc(divider(c))} center/contain no-repeat}
${s} .ornament{height:16px;margin:16px 40px 6px;background:${enc(divider(c))} center/contain no-repeat}
${s} .menu-bottom{background-image:${enc(divider(c))};background-repeat:no-repeat;background-position:center 6px;background-size:150px 16px;padding-top:28px}
${s} .reader[data-page=style] .flow :is(h1,h2)::after{content:"";display:block;width:140px;height:16px;margin:.5em ${chapterAlign === "left" ? "0" : "auto"} 0;background:${enc(divider(c))} center/contain no-repeat}
`;
}

const css = block("vintage", "#9a8a74", "rgba(246,238,221,.75)", "left") + block("autumn", "#8a6a3e", "rgba(230,201,142,.55)", "center");

const file = new URL("../css/style.css", import.meta.url);
let out = fs.readFileSync(file, "utf8").replace(/\n\/\* ЗАВИТКИ-НАЧАЛО[\s\S]*ЗАВИТКИ-КОНЕЦ \*\/\n/, "\n");
out += `\n/* ЗАВИТКИ-НАЧАЛО (создаётся tools/ornaments.mjs, руками не править) */${css}/* ЗАВИТКИ-КОНЕЦ */\n`;
fs.writeFileSync(file, out);
console.log("Завитки записаны в css/style.css");
