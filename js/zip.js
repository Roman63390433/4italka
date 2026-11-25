// Распаковка zip без библиотек. epub и fb2.zip — это zip-архивы.
// Zip устроен так: в конце файла лежит «оглавление» (central directory) со списком файлов и
// адресами, где каждый лежит. Сжатые файлы распаковываем встроенным в браузер DecompressionStream.

export async function openZip(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // ищем запись «конец оглавления» (подпись 0x06054b50) с конца файла
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Файл повреждён или это не zip-архив");

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const utf8 = new TextDecoder("utf-8");
  const entries = new Map();

  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error("Оглавление архива повреждено");
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.set(name, { method, compSize, local });
    p += 46 + nameLen + extraLen + commentLen;
  }

  async function data(name) {
    const e = entries.get(name);
    if (!e) return null;
    const nameLen = view.getUint16(e.local + 26, true);
    const extraLen = view.getUint16(e.local + 28, true);
    const start = e.local + 30 + nameLen + extraLen;
    const raw = bytes.subarray(start, start + e.compSize);
    if (e.method === 0) return raw;                  // без сжатия
    if (e.method !== 8) throw new Error("Неизвестный способ сжатия в архиве");
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  return {
    names: [...entries.keys()],
    // поиск без учёта регистра букв: в epub пути иногда пишут по-разному
    find(name) {
      if (entries.has(name)) return name;
      const low = name.toLowerCase();
      return [...entries.keys()].find(k => k.toLowerCase() === low) || null;
    },
    async text(name) { const d = await data(name); return d ? utf8.decode(d) : null; },
    async bytes(name) { return data(name); },
  };
}
