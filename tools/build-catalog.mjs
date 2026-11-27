// Собирает data/catalog.json — каталог русской классики с Викитеки. Запускать вручную (Node 20+, без пакетов):
//   node tools/build-catalog.mjs          — собрать каталог (долго: скачивает каждую книгу целиком, ~20–40 минут)
//   node tools/build-catalog.mjs --cached — пересобрать только из того, что уже скачано (кеш), новых книг не искать
//   node tools/build-catalog.mjs --check  — только проверить, что все страницы из готового каталога на месте
//
// Откуда что берётся (ничего не придумываем):
//  • список кандидатов ниже — только «что попробовать»; в каталог попадает книга, которая нашлась на Викитеке
//    в современной орфографии и скачалась целиком (все главы не пустые);
//  • название, автор, год — из шапки страницы Викитеки (год — «Опубл.», иначе категория «Литература NNNN года»);
//  • жанр — из категорий Викитеки («Романы», «Повести»…), иначе из первой фразы статьи Википедии («— повесть …»);
//  • описание — начало статьи Википедии о произведении (ссылка на неё — в шапке Викитеки); нет статьи — "".
// Скачанные страницы кешируются во временной папке, чтобы повторный запуск шёл быстро.

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { collectChapters, resolveBook, textOf, shortAuthor } from "../js/wikisource.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "catalog.json");
const CACHE = join(tmpdir(), "chitalka-catalog-cache");
const UA = { "User-Agent": "chitalka-catalog/1.0 (https://github.com/Roman63390433/4italka)" };

// кандидаты: [название, фамилия автора] — страница ищется как «Название (Фамилия)», иначе поиском
const CANDIDATES = `
Капитанская дочка|Пушкин; Дубровский|Пушкин; Пиковая дама|Пушкин; Повести Белкина|Пушкин; Выстрел|Пушкин; Метель|Пушкин;
Станционный смотритель|Пушкин; Барышня-крестьянка|Пушкин; Гробовщик|Пушкин; Арап Петра Великого|Пушкин; Евгений Онегин|Пушкин;
Медный всадник|Пушкин; Руслан и Людмила|Пушкин; Полтава|Пушкин; Цыганы|Пушкин; Борис Годунов|Пушкин; Моцарт и Сальери|Пушкин;
Сказка о царе Салтане|Пушкин; Сказка о рыбаке и рыбке|Пушкин; Сказка о мёртвой царевне и о семи богатырях|Пушкин;
Сказка о попе и о работнике его Балде|Пушкин; Сказка о золотом петушке|Пушкин; История Пугачёва|Пушкин;
Шинель|Гоголь; Нос|Гоголь; Тарас Бульба|Гоголь; Мёртвые души|Гоголь; Ревизор|Гоголь; Вий|Гоголь; Женитьба|Гоголь;
Невский проспект|Гоголь; Портрет|Гоголь; Записки сумасшедшего|Гоголь; Коляска|Гоголь; Ночь перед Рождеством|Гоголь;
Сорочинская ярмарка|Гоголь; Майская ночь, или Утопленница|Гоголь; Старосветские помещики|Гоголь; Страшная месть|Гоголь;
Повесть о том, как поссорился Иван Иванович с Иваном Никифоровичем|Гоголь; Игроки|Гоголь; Вечер накануне Ивана Купала|Гоголь;
Заколдованное место|Гоголь; Пропавшая грамота|Гоголь; Иван Фёдорович Шпонька и его тётушка|Гоголь;
Герой нашего времени|Лермонтов; Маскарад|Лермонтов; Мцыри|Лермонтов; Демон|Лермонтов; Бородино|Лермонтов;
Песня про царя Ивана Васильевича, молодого опричника и удалого купца Калашникова|Лермонтов; Вадим|Лермонтов;
Отцы и дети|Тургенев; Муму|Тургенев; Ася|Тургенев; Первая любовь|Тургенев; Дворянское гнездо|Тургенев; Накануне|Тургенев;
Рудин|Тургенев; Дым|Тургенев; Новь|Тургенев; Вешние воды|Тургенев; Записки охотника|Тургенев; Бежин луг|Тургенев;
Хорь и Калиныч|Тургенев; Месяц в деревне|Тургенев; Клара Милич|Тургенев; Песнь торжествующей любви|Тургенев; Призраки|Тургенев;
Степной король Лир|Тургенев; Постоялый двор|Тургенев;
Преступление и наказание|Достоевский; Идиот|Достоевский; Бесы|Достоевский; Братья Карамазовы|Достоевский;
Бедные люди|Достоевский; Белые ночи|Достоевский; Записки из подполья|Достоевский; Игрок|Достоевский;
Неточка Незванова|Достоевский; Униженные и оскорблённые|Достоевский; Записки из Мёртвого дома|Достоевский; Двойник|Достоевский;
Подросток|Достоевский; Село Степанчиково и его обитатели|Достоевский; Кроткая|Достоевский; Сон смешного человека|Достоевский;
Дядюшкин сон|Достоевский; Скверный анекдот|Достоевский; Хозяйка|Достоевский; Мальчик у Христа на ёлке|Достоевский;
Крокодил|Достоевский; Вечный муж|Достоевский; Честный вор|Достоевский; Слабое сердце|Достоевский; Ёлка и свадьба|Достоевский;
Война и мир|Толстой; Анна Каренина|Толстой; Воскресение|Толстой; Детство|Толстой; Отрочество|Толстой; Юность|Толстой;
Смерть Ивана Ильича|Толстой; Крейцерова соната|Толстой; Хаджи-Мурат|Толстой; Казаки|Толстой; Кавказский пленник|Толстой;
После бала|Толстой; Отец Сергий|Толстой; Холстомер|Толстой; Севастопольские рассказы|Толстой; Дьявол|Толстой;
Хозяин и работник|Толстой; Фальшивый купон|Толстой; Живой труп|Толстой; Власть тьмы|Толстой; Плоды просвещения|Толстой;
Два гусара|Толстой; Утро помещика|Толстой; Семейное счастие|Толстой; Алёша Горшок|Толстой;
Много ли человеку земли нужно|Толстой; Чем люди живы|Толстой; Набег|Толстой; Рубка леса|Толстой;
Палата № 6|Чехов; Дама с собачкой|Чехов; Человек в футляре|Чехов; Крыжовник|Чехов; О любви|Чехов; Ионыч|Чехов;
Попрыгунья|Чехов; Душечка|Чехов; Каштанка|Чехов; Степь|Чехов; Дуэль|Чехов; Чёрный монах|Чехов; Дом с мезонином|Чехов;
Мужики|Чехов; В овраге|Чехов; Архиерей|Чехов; Невеста|Чехов; Скрипка Ротшильда|Чехов; Толстый и тонкий|Чехов;
Смерть чиновника|Чехов; Хамелеон|Чехов; Лошадиная фамилия|Чехов; Злоумышленник|Чехов; Ванька|Чехов; Спать хочется|Чехов;
Тоска|Чехов; Унтер Пришибеевич|Чехов; Хирургия|Чехов; Остров Сахалин|Чехов; Вишнёвый сад|Чехов; Чайка|Чехов;
Три сестры|Чехов; Дядя Ваня|Чехов; Иванов|Чехов; Медведь|Чехов; Предложение|Чехов; Моя жизнь|Чехов;
Рассказ неизвестного человека|Чехов; Три года|Чехов; Учитель словесности|Чехов; Анна на шее|Чехов; Драма на охоте|Чехов;
Студент|Чехов; Беглец|Чехов; Тапёр|Чехов;
Мать|Горький; Старуха Изергиль|Горький; Челкаш|Горький; Макар Чудра|Горький; На дне|Горький; Детство|Горький;
В людях|Горький; Мои университеты|Горький; Фома Гордеев|Горький; Песня о Соколе|Горький; Песня о Буревестнике|Горький;
Двадцать шесть и одна|Горький; Мещане|Горький; Дачники|Горький; Супруги Орловы|Горький; Коновалов|Горький;
Олеся|Куприн; Поединок|Куприн; Гранатовый браслет|Куприн; Белый пудель|Куприн; Молох|Куприн; Яма|Куприн; Суламифь|Куприн;
Чудесный доктор|Куприн; Изумруд|Куприн; Гамбринус|Куприн; Листригоны|Куприн; Юнкера|Куприн; Штабс-капитан Рыбников|Куприн;
Антоновские яблоки|Бунин; Господин из Сан-Франциско|Бунин; Деревня|Бунин; Суходол|Бунин; Лёгкое дыхание|Бунин;
Солнечный удар|Бунин; Митина любовь|Бунин; Жизнь Арсеньева|Бунин; Тёмные аллеи|Бунин; Чистый понедельник|Бунин;
Иуда Искариот|Андреев; Рассказ о семи повешенных|Андреев; Красный смех|Андреев; Жизнь Василия Фивейского|Андреев;
Кусака|Андреев; Ангелочек|Андреев; Бездна|Андреев; Губернатор|Андреев;
Обломов|Гончаров; Обыкновенная история|Гончаров; Обрыв|Гончаров; Фрегат «Паллада»|Гончаров;
Левша|Лесков; Очарованный странник|Лесков; Леди Макбет Мценского уезда|Лесков; Тупейный художник|Лесков; Соборяне|Лесков;
Запечатлённый ангел|Лесков; Человек на часах|Лесков; Несмертельный Голован|Лесков; Колыванский муж|Лесков;
История одного города|Салтыков-Щедрин; Господа Головлёвы|Салтыков-Щедрин; Премудрый пискарь|Салтыков-Щедрин;
Повесть о том, как один мужик двух генералов прокормил|Салтыков-Щедрин; Дикий помещик|Салтыков-Щедрин;
Гроза|Островский; Бесприданница|Островский; Лес|Островский; Свои люди — сочтёмся|Островский;
На всякого мудреца довольно простоты|Островский; Снегурочка|Островский; Волки и овцы|Островский; Доходное место|Островский;
Бедность не порок|Островский; Таланты и поклонники|Островский;
Недоросль|Фонвизин; Бригадир|Фонвизин; Горе от ума|Грибоедов; Бедная Лиза|Карамзин; Наталья, боярская дочь|Карамзин;
Путешествие из Петербурга в Москву|Радищев; Кто виноват?|Герцен; Сорока-воровка|Герцен; Что делать?|Чернышевский;
Красный цветок|Гаршин; Attalea princeps|Гаршин; Четыре дня|Гаршин; Лягушка-путешественница|Гаршин; Сигнал|Гаршин;
Слепой музыкант|Короленко; В дурном обществе|Короленко; Сон Макара|Короленко; Без языка|Короленко;
Городок в табакерке|Одоевский; Чёрная курица, или Подземные жители|Погорельский; Аленький цветочек|Аксаков;
Детские годы Багрова-внука|Аксаков; Серая Шейка|Мамин-Сибиряк; Приваловские миллионы|Мамин-Сибиряк;
Тысяча душ|Писемский; Очерки бурсы|Помяловский; Конёк-Горбунок|Ершов; Светлана|Жуковский;
Кому на Руси жить хорошо|Некрасов; Мороз, Красный нос|Некрасов; Русские женщины|Некрасов; Дедушка Мазай и зайцы|Некрасов;
Двенадцать|Блок; Анна Снегина|Есенин; Чёрный человек|Есенин; Облако в штанах|Маяковский; Клоп|Маяковский; Баня|Маяковский;
Алые паруса|Грин; Бегущая по волнам|Грин; Собачье сердце|Булгаков; Роковые яйца|Булгаков; Белая гвардия|Булгаков;
Мастер и Маргарита|Булгаков; Записки юного врача|Булгаков; Мы|Замятин; Человек-амфибия|Беляев;
Голова профессора Доуэля|Беляев; Аэлита|Толстой; Гиперболоид инженера Гарина|Толстой; Двенадцать стульев|Ильф;
Золотой телёнок|Ильф; Тимур и его команда|Гайдар; Чук и Гек|Гайдар; Конармия|Бабель; Подпоручик Киже|Тынянов;
Котлован|Платонов; Малахитовая шкатулка|Бажов; Кладовая солнца|Пришвин
`.split(";").map(s => s.trim()).filter(Boolean).map(s => s.split("|").map(x => x.trim()));

// ---------- мелочи ----------

const pause = ms => new Promise(r => setTimeout(r, ms));
async function getJson(url) {
  for (let i = 1; ; i++) {
    const res = await fetch(url, { headers: UA });
    if ((res.status === 429 || res.status >= 500) && i < 6) { await pause((+res.headers.get("retry-after") || 5 * i) * 1000); continue; }
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return res.json();
  }
}
const wsApi = p => getJson("https://ru.wikisource.org/w/api.php?" + new URLSearchParams({ format: "json", formatversion: "2", ...p }));
const wpApi = p => getJson("https://ru.wikipedia.org/w/api.php?" + new URLSearchParams({ format: "json", formatversion: "2", ...p }));

const ONLY_CACHED = process.argv.includes("--cached");
const cacheFile = key => join(CACHE, key.replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 120) + ".json");
const inCache = async key => { try { await readFile(cacheFile(key)); return true; } catch { return false; } };
async function cached(key, make) {
  const file = cacheFile(key);
  try { return JSON.parse(await readFile(file, "utf8")); } catch {}
  const value = await make();
  await writeFile(file, JSON.stringify(value));
  return value;
}

const TR = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "",
  ы: "y", ь: "", э: "e", ю: "yu", я: "ya" };
const translit = s => s.toLowerCase().split("").map(c => TR[c] ?? c).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// жанр: категории Викитеки → наше слово
const GENRE_CATS = [
  [/^Романы( в стихах)?$/, "Роман"], [/^Повести$/, "Повесть"], [/^Рассказы$/, "Рассказ"], [/^Поэмы$/, "Поэма"],
  [/^Комедии$/, "Комедия"], [/^Трагедии$/, "Трагедия"], [/^Драмы$/, "Драма"], [/^Пьесы$/, "Пьеса"],
  [/^Сказки( в стихах)?$/, "Сказка"], [/^Басни$/, "Басня"], [/^Очерки$/, "Очерк"], [/^Стихотворения$/, "Стихотворение"],
  [/^Баллады$/, "Баллада"],
];
const GENRE_WORDS = ["роман", "повесть", "рассказ", "поэма", "комедия", "трагедия", "драма", "пьеса", "сказка", "очерк",
  "новелла", "стихотворение", "баллада", "басня", "водевиль", "мистерия", "фельетон", "притча"];
const cap = s => s[0].toUpperCase() + s.slice(1);

// жанр: сначала первая фраза Википедии («„Шинель“ — повесть Николая Гоголя…»: первое жанровое слово
// сразу после тире), потом категории Викитеки (они бывают неточны: «Первая любовь» там в «Романах»)
function genreFrom(cats, wpText) {
  const dash = wpText.search(/\s[—–]\s/);
  if (dash >= 0) {
    const after = wpText.slice(dash + 3, dash + 90).toLowerCase();
    const m = after.match(new RegExp(`(?:^|[\\s(«-])(${GENRE_WORDS.join("|")})(?:[\\s,.»)]|$)`));
    if (m) return /роман в стихах/.test(after) ? "Роман в стихах" : cap(m[1]);
  }
  for (const [re, g] of GENRE_CATS) if (cats.some(c => re.test(c))) return g;
  return "";
}

// деление на предложения без разрыва на сокращениях («И. С. Тургенева», «рус.», «т. е.», «1860 г.»)
function sentences(t) {
  const out = [];
  let start = 0;
  for (const m of t.matchAll(/[.!?…]+(?=\s+[«"(A-ZА-ЯЁ]|$)/g)) {
    const before = t.slice(start, m.index).split(/\s/).pop();
    if (/^[A-ZА-ЯЁ]$|^(рус|англ|франц|нем|лат|т|е|г|гг|др|см|тж|н|э|в|вв|им|св|ок|род|ум)$/i.test(before)) continue;
    out.push(t.slice(start, m.index + m[0].length).trim());
    start = m.index + m[0].length;
  }
  if (t.slice(start).trim()) out.push(t.slice(start).trim());
  return out;
}

function yearFrom(published, cats) {
  const y = (published.match(/1[6-9]\d\d/) || [])[0];
  if (y && +y <= 1960) return +y;
  const c = cats.map(c => (c.match(/^Литература (1[6-9]\d\d) года$/) || [])[1]).filter(Boolean).map(Number).sort((a, b) => a - b)[0];
  return c || null;
}

// начало статьи Википедии: 1–2 предложения, не длиннее ~320 букв
async function wikipediaIntro(title) {
  if (!title) return "";
  const j = await cached("wp " + title, () => wpApi({ action: "query", prop: "extracts", exintro: "1", explaintext: "1", redirects: "1", titles: title }));
  const page = j.query?.pages?.[0];
  if (!page || page.missing) return "";
  let t = (page.extract || "").split("\n").map(s => s.trim()).find(s => s.length > 40) || "";
  t = t.replace(/́/g, "").replace(/\[\d+\]/g, "")
    .replace(/\s*\((?:рус\. )?дореф\.[^)]*\)/g, "")             // «(рус. дореф. Отцы и дѣти)»
    .replace(/\(\s*[;,]?\s*\)/g, "").replace(/\s+/g, " ").trim();
  let out = "";
  for (const s of sentences(t)) {
    if (out && (out + " " + s).length > 320) break;
    out += (out ? " " : "") + s;
    if (out.length > 160) break;
  }
  return out.trim();
}

async function findPage(title, author) {
  const guess = `${title} (${author})`;
  const j = await wsApi({ action: "query", titles: guess, redirects: "1" });
  const p = j.query.pages[0];
  if (!p.missing) return p.title;
  // поиск: страница, чьё имя начинается с названия, а в скобках — фамилия автора
  const s = await wsApi({ action: "query", list: "search", srsearch: `intitle:"${title}" ${author}`, srnamespace: "0", srlimit: "20" });
  const norm = x => x.toLowerCase().replace(/ё/g, "е");
  const hit = s.query.search.find(r => norm(r.title).startsWith(norm(title) + " (") && norm(r.title).includes(norm(author)) && !r.title.includes("/"));
  return hit ? hit.title : null;
}

// ---------- проверка готового каталога ----------

if (process.argv.includes("--check")) {
  const cat = JSON.parse(await readFile(OUT, "utf8"));
  let bad = 0;
  for (const b of cat.books) {
    try { const r = await resolveBook(b.page); if (!r.page && !r.subs.length) throw new Error("пустая"); }
    catch (e) { bad++; console.log("✗", b.id, b.page, "—", e.message); }
  }
  console.log(bad ? `Не в порядке: ${bad} из ${cat.books.length}` : `Все ${cat.books.length} страниц на месте.`);
  process.exit(bad ? 1 : 0);
}

// ---------- сборка ----------

await mkdir(CACHE, { recursive: true });
await mkdir(dirname(OUT), { recursive: true });
const books = [];
const skipped = [];
const seenRoots = new Set();

for (const [title, author] of CANDIDATES) {
  const label = `${title} (${author})`;
  // --cached: только кандидаты, до которых прошлый запуск уже дошёл (быстрая пересборка)
  if (ONLY_CACHED && !(await inCache("find " + label))) { skipped.push([label, "не проверялся (--cached)"]); continue; }
  try {
    const page = await cached("find " + label, () => findPage(title, author));
    if (!page) { skipped.push([label, "нет страницы"]); continue; }

    const info = await cached("book " + page, async () => {
      const { book, chapters } = await collectChapters(page);
      return {
        root: book.root, header: book.header, wikipedia: book.wikipedia, cats: book.cats,
        chapters: chapters.map(c => ({ title: c.title, letters: textOf(c.html).length, old: (c.html.match(/[ѣѢіІѳѲ]/g) || []).length })),
      };
    });
    if (seenRoots.has(info.root)) { skipped.push([label, "повтор"]); continue; }

    const letters = info.chapters.reduce((s, c) => s + c.letters, 0);
    const empty = info.chapters.filter(c => c.letters < 100);
    const old = info.chapters.reduce((s, c) => s + c.old, 0);
    if (letters < 2000) { skipped.push([label, `слишком мало текста (${letters})`]); continue; }
    if (empty.length) { skipped.push([label, `пустые главы: ${empty.slice(0, 3).map(c => c.title).join(", ")}`]); continue; }
    if (old > 30) { skipped.push([label, "дореформенная орфография"]); continue; }
    if (!info.header.author) { skipped.push([label, "нет автора в шапке"]); continue; }

    const description = await wikipediaIntro(info.wikipedia);
    const fullAuthor = info.header.author;
    // в шапке иногда «Без названия» — тогда название берём из имени страницы Викитеки («Страшная месть (Гоголь)»)
    // а если в шапке длиннее («Поэма „Двенадцать“», «Бородино („Скажи-ка, дядя…“)») — тоже короткое имя страницы
    const base = page.split("/").pop().replace(/\s*\([^)]*\)$/, "");
    const head = (info.header.title || "").replace(/\s*[\[(:]\s*$/, "").trim();
    const wsTitle = !head || /без названия|список редакций/i.test(head) || head.length > base.length && head.toLowerCase().replace(/ё/g, "е").includes(base.toLowerCase().replace(/ё/g, "е")) ? base : head;
    const entry = {
      id: "ws-" + translit(fullAuthor.split(/\s+/).pop() + " " + wsTitle),
      title: wsTitle.replace(/\.$/, ""),
      author: shortAuthor(fullAuthor),
      year: yearFrom(info.header.published || "", info.cats),
      genre: genreFrom(info.cats, description),
      page,
      chapters: info.chapters.length,
      description,
      size: Math.round(letters / 1000) * 1000 || letters,
    };
    if (books.some(b => b.id === entry.id)) entry.id += "-" + (entry.year || books.length);
    seenRoots.add(info.root);
    books.push(entry);
    console.log("✓", entry.id, "|", entry.author, "|", entry.title, "|", entry.year, "|", entry.genre, "|", entry.chapters, "гл. |", entry.size);
  } catch (e) {
    skipped.push([label, e.message]);
    console.log("✗", label, "—", e.message);
  }
}

// одно написание автора: «Федор Достоевский» и «Фёдор Достоевский» → самое частое
const forms = {};
for (const b of books) (forms[b.author.replace(/ё/g, "е")] ??= {})[b.author] = (forms[b.author.replace(/ё/g, "е")][b.author] || 0) + 1;
for (const b of books) {
  const f = forms[b.author.replace(/ё/g, "е")];
  b.author = Object.keys(f).sort((x, y) => f[y] - f[x] || (y.includes("ё") - x.includes("ё")))[0];
}

// не больше LIMIT книг: сначала книги с описанием и жанром, у каждого автора — не больше PER книг
// (в порядке списка кандидатов, где самые известные вещи стоят первыми); проза и стихи/пьесы — как нашлось
const LIMIT = 150;
const full = b => b.description && b.genre ? 0 : 1;
const ordered = books.map((b, i) => [b, i]).sort((x, y) => full(x[0]) - full(y[0]) || x[1] - y[1]).map(x => x[0]);
let picked = ordered;
for (let per = 30; per > 0 && picked.length > LIMIT; per--) {
  const n = {};
  picked = ordered.filter(b => (n[b.author] = (n[b.author] || 0) + 1) <= per);
}
const keep = new Set(picked);
for (const b of books) if (!keep.has(b)) skipped.push([`${b.title} (${b.author})`, "не вошла в лимит " + LIMIT]);
books.splice(0, books.length, ...books.filter(b => keep.has(b)));

// ---------- подборки: только по признакам из данных ----------

const by = (name, id, test) => ({ id, name, ids: books.filter(test).sort((a, b) => (a.year || 9999) - (b.year || 9999)).map(b => b.id) });
const collections = [
  by("Прочитать за вечер", "evening", b => b.size && b.size <= 60000 && !/Стихотворение/.test(b.genre)),
  by("Романы", "novels", b => /^Роман/.test(b.genre)),
  by("Повести", "povesti", b => b.genre === "Повесть"),
  by("Пьесы", "plays", b => /Пьеса|Комедия|Трагедия|Драма/.test(b.genre)),
  by("Поэмы и стихи", "poems", b => /Поэма|Баллада|Стихотворение|в стихах/.test(b.genre)),
  by("XX век", "xx", b => b.year && b.year >= 1901),
  by("Сказки", "tales", b => b.genre === "Сказка"),
].filter(c => c.ids.length >= 4).slice(0, 6);

const catalog = { updated: new Date().toISOString(), books, collections };
await writeFile(OUT, JSON.stringify(catalog, null, 1) + "\n");
await writeFile(join(CACHE, "skipped.txt"), skipped.map(s => s.join(" — ")).join("\n"));
console.log(`\nГотово: ${books.length} книг, подборки: ${collections.map(c => `${c.name} (${c.ids.length})`).join(", ")}`);
console.log(`Пропущено ${skipped.length} (список: ${join(CACHE, "skipped.txt")})`);
