import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getAvatarEmoji } from "./Profile";
import {
  searchUsers,
  sendFriendRequest,
  getPendingRequests,
  acceptRequest,
  rejectRequest,
  getFriends,
  removeFriend,
} from "../utils/social";

export default function Friends() {
  const { user } = useAuth();
  const [tab, setTab] = useState("users");
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [userFilter, setUserFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadFriends = useCallback(async () => {
    const data = await getFriends();
    setFriends(data);
  }, []);

  const loadRequests = useCallback(async () => {
    const data = await getPendingRequests();
    setRequests(data);
  }, []);

  const loadAllUsers = useCallback(async () => {
    const data = await searchUsers("");
    setAllUsers(data);
  }, []);

  useEffect(() => {
    Promise.all([loadAllUsers(), loadFriends(), loadRequests()]).finally(() => setLoading(false));
  }, [loadAllUsers, loadFriends, loadRequests]);

  const filteredUsers = allUsers.filter((u) =>
    u.username.toLowerCase().includes(userFilter.toLowerCase())
  );

  const refreshAllUsers = async () => {
    const data = await searchUsers("");
    setAllUsers(data);
  };

  const handleSendRequest = async (receiverId) => {
    setError(null);
    try {
      const result = await sendFriendRequest(receiverId);
      if (result.autoAccepted) {
        await loadFriends();
        await loadRequests();
      }
      await refreshAllUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAccept = async (requestId) => {
    setError(null);
    try {
      await acceptRequest(requestId);
      await loadRequests();
      await loadFriends();
      await refreshAllUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleReject = async (requestId) => {
    setError(null);
    try {
      await rejectRequest(requestId);
      await loadRequests();
      await refreshAllUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemove = async (friendshipId) => {
    setError(null);
    try {
      await removeFriend(friendshipId);
      await loadFriends();
      await refreshAllUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!user) return null;

  return (
    <div className="friends-page">
      <div className="friends-card">
        <Link to="/" className="user-detail-back">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
          Volver
        </Link>

        <h2 className="auth-title">Amigos</h2>

        <div className="admin-history-tabs">
          <button
            className={`admin-tab ${tab === "users" ? "active" : ""}`}
            onClick={() => setTab("users")}
          >
            Usuarios
          </button>
          <button
            className={`admin-tab ${tab === "friends" ? "active" : ""}`}
            onClick={() => setTab("friends")}
          >
            Mis Amigos ({friends.length})
          </button>
          <button
            className={`admin-tab ${tab === "requests" ? "active" : ""}`}
            onClick={() => setTab("requests")}
          >
            Solicitudes
            {requests.length > 0 && (
              <span className="friends-badge">{requests.length}</span>
            )}
          </button>
        </div>

        {error && <p className="auth-error">{error}</p>}

        {loading ? (
          <p className="admin-history-empty">Cargando...</p>
        ) : (
          <>
            {/* All Users Tab */}
            {tab === "users" && (
              <div>
                <input
                  type="text"
                  className="friends-search-input"
                  placeholder="Filtrar por nombre de usuario..."
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value)}
                />
                <div className="friends-list">
                  {filteredUsers.length === 0 ? (
                    <p className="admin-history-empty">No se encontraron usuarios.</p>
                  ) : (
                    filteredUsers.map((u) => (
                      <div key={u.id} className="friends-list-item">
                        <Link to={`/user/${u.id}`} className="friends-list-info">
                          <span className="friends-list-avatar">
                            {getAvatarEmoji(u.avatar)}
                          </span>
                          <span className="friends-list-name">{u.username}</span>
                        </Link>
                        {u.friendshipStatus === "accepted" ? (
                          <span className="btn-friend-status accepted">Amigos</span>
                        ) : u.friendshipStatus === "pending_sent" ? (
                          <span className="btn-friend-status pending">Pendiente</span>
                        ) : u.friendshipStatus === "pending_received" ? (
                          <button
                            className="btn-friend-accept"
                            onClick={() => handleAccept(u.friendshipId)}
                            title="Aceptar solicitud"
                          >
                            Aceptar
                          </button>
                        ) : (
                          <button
                            className="btn-friend-add"
                            onClick={() => handleSendRequest(u.id)}
                          >
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                              <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                            </svg>
                            Agregar
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Friends Tab */}
            {tab === "friends" && (
              <div className="friends-list">
                {friends.length === 0 ? (
                  <p className="admin-history-empty">No tienes amigos aun. Busca usuarios para agregar.</p>
                ) : (
                  friends.map((friend) => (
                    <div key={friend.id} className="friends-list-item">
                      <Link to={`/user/${friend.id}`} className="friends-list-info">
                        <span className="friends-list-avatar">
                          {getAvatarEmoji(friend.avatar)}
                        </span>
                        <span className="friends-list-name">{friend.username}</span>
                      </Link>
                      <button
                        className="btn-friend-remove"
                        onClick={() => handleRemove(friend.friendshipId)}
                        title="Eliminar amigo"
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Requests Tab */}
            {tab === "requests" && (
              <div className="friends-list">
                {requests.length === 0 ? (
                  <p className="admin-history-empty">No tienes solicitudes pendientes.</p>
                ) : (
                  requests.map((req) => (
                    <div key={req.id} className="friends-list-item">
                      <Link to={`/user/${req.senderId}`} className="friends-list-info">
                        <span className="friends-list-avatar">
                          {getAvatarEmoji(req.avatar)}
                        </span>
                        <span className="friends-list-name">{req.username}</span>
                      </Link>
                      <div className="friends-list-actions">
                        <button
                          className="btn-friend-accept"
                          onClick={() => handleAccept(req.id)}
                          title="Aceptar"
                        >
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                          </svg>
                        </button>
                        <button
                          className="btn-friend-reject"
                          onClick={() => handleReject(req.id)}
                          title="Rechazar"
                        >
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

          </>
        )}
      </div>
    </div>
  );
}
