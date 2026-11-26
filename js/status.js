// Статусы книг: читаю / хочу прочитать / отложено / прочитано / брошено. Только правила, без кнопок.
export const STATUSES = [
  { id: "reading", name: "Читаю", chip: "Читаю" },
  { id: "want", name: "Хочу прочитать", chip: "Хочу" },
  { id: "paused", name: "Отложено", chip: "Отложено" },
  { id: "done", name: "Прочитано", chip: "Прочитано" },
  { id: "dropped", name: "Брошено", chip: "Брошено" },
];

const valid = id => STATUSES.some(s => s.id === id);
export const statusName = id => STATUSES.find(s => s.id === id)?.name || "";

// статус книги; у книг, добавленных до появления статусов, он выводится из прогресса
export function statusOf(book, percent = 0) {
  if (valid(book.status)) return book.status;
  if (percent >= 100) return "done";
  if (percent > 0 || book.opened) return "reading";
  return "want";
}

// книгу открыли: «хочу прочитать» (или ещё без статуса) превращается в «читаю»; остальные не трогаем
export function statusOnOpen(book, percent = 0) {
  const s = statusOf(book, percent);
  return s === "want" ? "reading" : s;
}
