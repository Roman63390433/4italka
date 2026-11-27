// FantLab (api.fantlab.ru): живой поиск произведений и подробности одного произведения.
// Ключ не нужен, браузер может спрашивать напрямую. Только витрина: описание, жанры, обложка — файлов нет.

const API = "https://api.fantlab.ru";
export const SITE = "https://fantlab.ru";

// убрать разметку FantLab ([autor=12]Имя[/autor], [b], [url=…]) и HTML, оставить чистый текст с абзацами
export function cleanText(s) {
  return (s || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\[\/?[a-z]+(?:=[^\]]*)?\]/gi, "")
    .replace(/&quot;/g, "\"").replace(/&laquo;/g, "«").replace(/&raquo;/g, "»")
    .replace(/&mdash;/g, "—").replace(/&ndash;/g, "–").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function api(path, signal) {
  const r = await fetch(API + path, { signal });
  if (!r.ok) throw new Error("FantLab ответил " + r.status);
  return r.json();
}

// что считаем книгой (статьи, журналы, сценарии, отрывки, рецензии — не показываем)
const BOOK_TYPES = new Set(["novel", "story", "shortstory", "microstory", "collection", "anthology",
  "cycle", "poem", "short", "documental", "novelette", "comix", "piece", "epic"]);

// поиск: до limit произведений-книг, в формате книг home.json
export async function searchWorks(q, { signal, limit = 12 } = {}) {
  const d = await api("/search-works?q=" + encodeURIComponent(q) + "&page=1", signal);
  return (d.matches || d || [])
    .filter(m => m && m.work_id && (m.rusname || m.name) && BOOK_TYPES.has(m.name_eng))
    .slice(0, limit)
    .map(m => {
      const authors = [1, 2, 3, 4, 5].map(i => m["autor" + i + "_rusname"]).filter(Boolean);
      const pic = m.pic_edition_id || m.pic_edition_id_auto;
      return {
        id: "fl-w" + m.work_id, workId: m.work_id, editionId: null,
        title: cleanText(m.rusname || m.name),
        authors: authors.length ? authors : [m.all_autor_rusname].filter(Boolean),
        year: m.year || null, type: m.name_show_im || "",
        publisher: "", series: "", date: "", description: "", genres: [],
        cover: pic ? `${SITE}/images/editions/big/${pic}` : null,
        url: `${SITE}/work${m.work_id}`,
      };
    });
}

// жанры голосованием: верхние жанры и поджанры, за которые проголосовала хотя бы половина
function genreLabels(cls) {
  const group = (cls?.genre_group || []).find(g => g.genre_group_id === 1) || cls?.genre_group?.[0];
  const out = [];
  const walk = list => (list || []).forEach(g => {
    if ((g.percent ?? 1) >= 0.5 && g.label) out.push(g.label);
    walk(g.genre);
  });
  walk(group?.genre);
  return [...new Set(out)].slice(0, 5);
}

// подробности произведения: описание, жанры, обложка, год, вид
export async function workDetails(workId, { signal } = {}) {
  const w = await api(`/work/${workId}/extended`, signal);
  return {
    description: cleanText(w.work_description),
    genreLabels: genreLabels(w.classificatory),
    cover: w.image ? SITE + w.image : null,
    year: w.work_year || null,
    type: w.work_type || "",
  };
}
