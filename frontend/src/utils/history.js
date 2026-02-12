const STORAGE_KEY = "oidoMusical_history";
const MAX_HISTORY = 50;

export function getHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addToHistory(song) {
  const history = getHistory();
  const entry = {
    ...song,
    id: crypto.randomUUID(),
    timestamp: Date.now(),
  };
  const updated = [entry, ...history].slice(0, MAX_HISTORY);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export function clearHistory() {
  localStorage.removeItem(STORAGE_KEY);
}
