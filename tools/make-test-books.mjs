// Делает тестовые книги в папке test/: fb2 (windows-1251), fb2.zip и epub.
// Текст — «Белые ночи» Достоевского (общественное достояние), повторён, чтобы было много страниц.
// Запуск: node tools/make-test-books.mjs
import fs from "node:fs";
import zlib from "node:zlib";

const dir = new URL("../test/", import.meta.url);
fs.mkdirSync(dir, { recursive: true });

const P = [
  "Была чудная ночь, такая ночь, которая разве только и может быть тогда, когда мы молоды, любезный читатель. Небо было такое звездное, такое светлое небо, что, взглянув на него, невольно нужно было спросить себя: неужели же могут жить под таким небом разные сердитые и капризные люди?",
  "Это тоже молодой вопрос, любезный читатель, очень молодой, но пошли его вам господь чаще на душу!..",
  "Говоря о капризных и разных сердитых господах, я не мог не припомнить и моего благонравного поведения во весь тот день. С самого утра меня стала мучить какая-то удивительная тоска.",
];
const para = (n, note) => Array.from({ length: n }, (_, i) => P[i % 3] + (note && i === 1 ? ' <a l:href="#n1" type="note">[1]</a>' : "")).map(t => `<p>${t}</p>`).join("\n");

// ---- кодировка windows-1251 (только русские буквы и знаки, которые есть в тексте) ----
function cp1251(str) {
  const out = [];
  for (const ch of str) {
    const c = ch.codePointAt(0);
    if (c < 128) out.push(c);
    else if (c >= 0x410 && c <= 0x44f) out.push(c - 0x410 + 0xc0);
    else if (c === 0x401) out.push(0xa8);
    else if (c === 0x451) out.push(0xb8);
    else if (c === 0xab) out.push(0xab);
    else if (c === 0xbb) out.push(0xbb);
    else if (c === 0x2014) out.push(0x97);
    else if (c === 0x2026) out.push(0x85);
    else out.push(0x3f);
  }
  return Buffer.from(out);
}

const png = fs.readFileSync(new URL("../icons/icon-192.png", import.meta.url));
const fb2 = `<?xml version="1.0" encoding="windows-1251"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
<description><title-info><author><first-name>Фёдор</first-name><last-name>Достоевский</last-name></author>
<book-title>Белые ночи (тест fb2)</book-title><coverpage><image l:href="#cover.png"/></coverpage><lang>ru</lang></title-info></description>
<body><title><p>Белые ночи</p></title>
<epigraph><p>…Иль был он создан для того, Чтобы побыть хотя мгновенье В соседстве сердца твоего?..</p><text-author>Ив. Тургенев</text-author></epigraph>
<section><title><p>Ночь первая</p></title>${para(30, true)}</section>
<section><title><p>Ночь вторая</p></title>${para(30)}<poem><stanza><v>Строка стиха первая,</v><v>строка стиха вторая.</v></stanza></poem></section>
<section><title><p>Ночь третья</p></title>${para(20)}</section>
</body>
<body name="notes"><section id="n1"><title><p>1</p></title><p>Это тестовая сноска: она открывается снизу по нажатию.</p></section></body>
<binary id="cover.png" content-type="image/png">${png.toString("base64")}</binary>
</FictionBook>`;
fs.writeFileSync(new URL("belye-nochi.fb2", dir), cp1251(fb2));

// ---- простой zip (для fb2.zip и epub) ----
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

function zip(files) {             // files: [[name, Buffer, store?]]
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, data, store] of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const comp = store ? data : zlib.deflateRawSync(data);
    const method = store ? 0 : 8, crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x800, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    locals.push(lh, nameBuf, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x800, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

fs.writeFileSync(new URL("belye-nochi.fb2.zip", dir), zip([["belye-nochi.fb2", cp1251(fb2)]]));

// ---- epub ----
const u = s => Buffer.from(s, "utf8");
const xhtml = (title, body) => `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${title}</title><style>p{color:red}</style><script>alert("плохой код")</script></head><body>${body}</body></html>`;
const epub = zip([
  ["mimetype", u("application/epub+zip"), true],
  ["META-INF/container.xml", u(`<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`)],
  ["OEBPS/content.opf", u(`<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">test</dc:identifier><dc:title>Белые ночи (тест epub)</dc:title><dc:creator>Фёдор Достоевский</dc:creator><dc:language>ru</dc:language></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="cover" href="images/cover.png" media-type="image/png" properties="cover-image"/><item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/></manifest>
<spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`)],
  ["OEBPS/nav.xhtml", u(xhtml("Оглавление", `<nav epub:type="toc"><ol><li><a href="text/ch1.xhtml">Ночь первая</a></li><li><a href="text/ch2.xhtml#start">Ночь вторая</a></li></ol></nav>`))],
  ["OEBPS/images/cover.png", png, true],
  ["OEBPS/text/ch1.xhtml", u(xhtml("1", `<h2>Ночь первая</h2><p onclick="alert(1)">${P[0]}</p><p><img src="../images/cover.png" onerror="alert(2)"/></p>${para(30).replace(/<a[^>]*>\[1\]<\/a>/, "")}<p><a href="https://example.com">внешняя ссылка</a> — только текст.</p>`))],
  ["OEBPS/text/ch2.xhtml", u(xhtml("2", `<h2 id="start">Ночь вторая</h2>${para(25)}<iframe src="https://example.com"></iframe>`))],
]);
fs.writeFileSync(new URL("belye-nochi.epub", dir), epub);
console.log("Готово:", fs.readdirSync(dir).join(", "));
