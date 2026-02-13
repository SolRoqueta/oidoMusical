import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getAvatarEmoji } from "./Profile";
import { getFriends } from "../utils/social";
import { createRoom, getMyRooms, closeRoom } from "../utils/gameRooms";

export default function GameRooms() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [rooms, setRooms] = useState([]);
  const [friends, setFriends] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedFriends, setSelectedFriends] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const loadRooms = useCallback(async () => {
    const data = await getMyRooms();
    setRooms(data);
  }, []);

  const loadFriends = useCallback(async () => {
    const data = await getFriends();
    setFriends(data);
  }, []);

  useEffect(() => {
    Promise.all([loadRooms(), loadFriends()]).finally(() => setLoading(false));
  }, [loadRooms, loadFriends]);

  const toggleFriend = (id) => {
    setSelectedFriends((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreate = async () => {
    if (selectedFriends.size === 0) return;
    setCreating(true);
    setError(null);
    try {
      const result = await createRoom([...selectedFriends]);
      navigate(`/game/${result.roomId}`);
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  };

  const handleClose = async (roomId) => {
    setError(null);
    try {
      await closeRoom(roomId);
      await loadRooms();
    } catch (err) {
      setError(err.message);
    }
  };

  const stateLabel = (state) => {
    switch (state) {
      case "LOBBY": return "En lobby";
      case "PLAYING": return "Jugando";
      case "THINKING": return "Pensando";
      case "ROUND_END": return "Fin de ronda";
      default: return state;
    }
  };

  if (!user) return null;

  return (
    <div className="game-rooms-page">
      <div className="game-rooms-card">
        <Link to="/" className="user-detail-back">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
          Volver
        </Link>

        <h2 className="auth-title">Salas de Juego</h2>

        {error && <p className="auth-error">{error}</p>}

        {/* Create Room Section */}
        {!showCreate ? (
          <button
            className="btn btn-record game-rooms-create-btn"
            onClick={() => setShowCreate(true)}
          >
            Crear Sala
          </button>
        ) : (
          <div className="game-rooms-create">
            <p className="game-rooms-create-title">Invitar amigos a la sala:</p>
            {friends.length === 0 ? (
              <p className="admin-history-empty">
                No tienes amigos aun.{" "}
                <Link to="/friends" className="auth-link">Agrega amigos</Link> para jugar.
              </p>
            ) : (
              <>
                <div className="game-rooms-friend-list">
                  {friends.map((f) => (
                    <label key={f.id} className={`game-rooms-friend-item${selectedFriends.has(f.id) ? " selected" : ""}`}>
                      <input
                        type="checkbox"
                        checked={selectedFriends.has(f.id)}
                        onChange={() => toggleFriend(f.id)}
                      />
                      <span className="friends-list-avatar">{getAvatarEmoji(f.avatar)}</span>
                      <span className="friends-list-name">{f.username}</span>
                    </label>
                  ))}
                </div>
                <div className="game-rooms-create-actions">
                  <button
                    className="btn btn-record"
                    onClick={handleCreate}
                    disabled={selectedFriends.size === 0 || creating}
                  >
                    {creating ? "Creando..." : "Crear"}
                  </button>
                  <button
                    className="btn game-btn-rindo"
                    onClick={() => { setShowCreate(false); setSelectedFriends(new Set()); }}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Room List */}
        <div className="game-rooms-list-section">
          <p className="game-rooms-list-title">Mis Salas</p>
          {loading ? (
            <p className="admin-history-empty">Cargando...</p>
          ) : rooms.length === 0 ? (
            <p className="admin-history-empty">No hay salas disponibles. Crea una para jugar con amigos.</p>
          ) : (
            <div className="game-rooms-list">
              {rooms.map((r) => (
                <div key={r.roomId} className="game-rooms-item">
                  <div className="game-rooms-item-info">
                    <span className="game-rooms-item-name">
                      Sala de {r.creatorUsername}
                    </span>
                    <span className="game-rooms-item-meta">
                      <span className={`game-room-status ${r.state.toLowerCase()}`}>{stateLabel(r.state)}</span>
                      <span className="game-rooms-item-players">{r.playerCount} jugador{r.playerCount !== 1 ? "es" : ""}</span>
                    </span>
                  </div>
                  <div className="game-rooms-item-actions">
                    <Link to={`/game/${r.roomId}`} className="btn-friend-accept">
                      Unirse
                    </Link>
                    {r.creatorId === user.id && (
                      <button
                        className="btn-friend-remove"
                        onClick={() => handleClose(r.roomId)}
                        title="Cerrar sala"
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Refresh button */}
        <button className="game-rooms-refresh" onClick={loadRooms} title="Actualizar salas">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
          </svg>
          Actualizar
        </button>
      </div>
    </div>
  );
}
