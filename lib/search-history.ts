const KEY = "hlidarkaup_search_history";
const MAX = 6;

export function getSearchHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveSearchHistory(query: string) {
  if (query.trim().length < 2) return;
  const prev = getSearchHistory().filter((h) => h !== query.trim());
  localStorage.setItem(KEY, JSON.stringify([query.trim(), ...prev].slice(0, MAX)));
}

export function clearSearchHistory() {
  if (typeof window !== "undefined") localStorage.removeItem(KEY);
}
