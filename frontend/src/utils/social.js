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

export async function searchUsers(query) {
  try {
    const res = await fetch(
      `${API_URL}/social/search?q=${encodeURIComponent(query)}`,
      { headers: authHeaders() }
    );
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function sendFriendRequest(receiverId) {
  const res = await fetch(`${API_URL}/social/friends/request`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ receiver_id: receiverId }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(parseError(data, "Error al enviar solicitud"));
  }
  return await res.json();
}

export async function getPendingRequests() {
  try {
    const res = await fetch(`${API_URL}/social/friends/requests`, {
      headers: authHeaders(),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function acceptRequest(requestId) {
  const res = await fetch(
    `${API_URL}/social/friends/requests/${requestId}/accept`,
    { method: "PUT", headers: authHeaders() }
  );
  if (!res.ok) {
    const data = await res.json();
    throw new Error(parseError(data, "Error al aceptar solicitud"));
  }
  return await res.json();
}

export async function rejectRequest(requestId) {
  const res = await fetch(
    `${API_URL}/social/friends/requests/${requestId}/reject`,
    { method: "PUT", headers: authHeaders() }
  );
  if (!res.ok) {
    const data = await res.json();
    throw new Error(parseError(data, "Error al rechazar solicitud"));
  }
  return await res.json();
}

export async function getFriends() {
  try {
    const res = await fetch(`${API_URL}/social/friends`, {
      headers: authHeaders(),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function removeFriend(friendshipId) {
  const res = await fetch(`${API_URL}/social/friends/${friendshipId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(parseError(data, "Error al eliminar amigo"));
  }
  return await res.json();
}

export async function getPublicProfile(userId) {
  const res = await fetch(`${API_URL}/social/users/${userId}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(parseError(data, "Error al cargar perfil"));
  }
  return await res.json();
}
