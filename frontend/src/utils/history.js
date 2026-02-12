const API_URL = "http://localhost:8000";

function getToken() {
  return localStorage.getItem("oidoMusical_token");
}

function authHeaders() {
  const token = getToken();
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

export async function getHistory() {
  try {
    const res = await fetch(`${API_URL}/history`, { headers: authHeaders() });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function addToHistory(song) {
  try {
    await fetch(`${API_URL}/history`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(song),
    });
  } catch {
    // silently fail
  }
}

export async function clearHistory() {
  try {
    await fetch(`${API_URL}/history`, {
      method: "DELETE",
      headers: authHeaders(),
    });
  } catch {
    // silently fail
  }
}
