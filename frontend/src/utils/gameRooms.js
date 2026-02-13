const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function getToken() {
  return localStorage.getItem("oidoMusical_token");
}

function authHeaders() {
  const token = getToken();
  return token
    ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

function parseError(data, fallback) {
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail)) return data.detail.map((e) => e.msg).join(", ");
  return fallback;
}

export async function createRoom(invitedIds) {
  const res = await fetch(`${API_URL}/game/rooms`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ invited_ids: invitedIds }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(parseError(data, "Error al crear sala"));
  }
  return await res.json();
}

export async function getMyRooms() {
  try {
    const res = await fetch(`${API_URL}/game/rooms`, {
      headers: authHeaders(),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function closeRoom(roomId) {
  const res = await fetch(`${API_URL}/game/rooms/${roomId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(parseError(data, "Error al cerrar sala"));
  }
  return await res.json();
}
