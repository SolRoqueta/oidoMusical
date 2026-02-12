import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function UserDetail() {
  const { userId } = useParams();
  const { token } = useAuth();
  const [user, setUser] = useState(null);
  const [searchLog, setSearchLog] = useState([]);
  const [savedHistory, setSavedHistory] = useState([]);
  const [historyTab, setHistoryTab] = useState("log");

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  useEffect(() => {
    async function fetchData() {
      const [usersRes, logRes, savedRes] = await Promise.all([
        fetch(`${API_URL}/admin/users`, { headers }),
        fetch(`${API_URL}/admin/users/${userId}/search-log`, { headers }),
        fetch(`${API_URL}/admin/users/${userId}/saved`, { headers }),
      ]);
      if (usersRes.ok) {
        const users = await usersRes.json();
        setUser(users.find((u) => u.id === Number(userId)) || null);
      }
      setSearchLog(logRes.ok ? await logRes.json() : []);
      setSavedHistory(savedRes.ok ? await savedRes.json() : []);
    }
    fetchData();
  }, [userId, token]);

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    const day = date.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
    const time = date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    return `${day} a las ${time}`;
  };

  const currentList = historyTab === "log" ? searchLog : savedHistory;

  if (!user) {
    return (
      <div className="auth-page">
        <p className="status loading">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="user-detail-page">
      <div className="user-detail-left">
        <Link to="/admin" className="user-detail-back">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
          Volver
        </Link>

        <div className="user-detail-card">
          <div className="user-detail-avatar">
            <svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          </div>
          <h2 className="user-detail-name">{user.username}</h2>
          <span className={`admin-role ${user.role}`}>{user.role}</span>
        </div>

        <div className="user-detail-info">
          <div className="user-detail-field">
            <span className="user-detail-label">ID</span>
            <span className="user-detail-value">{user.id}</span>
          </div>
          <div className="user-detail-field">
            <span className="user-detail-label">Email</span>
            <span className="user-detail-value">{user.email}</span>
          </div>
          <div className="user-detail-field">
            <span className="user-detail-label">Registro</span>
            <span className="user-detail-value">{formatDate(user.createdAt)}</span>
          </div>
          <div className="user-detail-field">
            <span className="user-detail-label">Búsquedas</span>
            <span className="user-detail-value">{searchLog.length}</span>
          </div>
          <div className="user-detail-field">
            <span className="user-detail-label">Guardadas</span>
            <span className="user-detail-value">{savedHistory.length}</span>
          </div>
        </div>
      </div>

      <div className="user-detail-right">
        <div className="admin-history-tabs">
          <button
            className={`admin-tab ${historyTab === "log" ? "active" : ""}`}
            onClick={() => setHistoryTab("log")}
          >
            Todas las búsquedas ({searchLog.length})
          </button>
          <button
            className={`admin-tab ${historyTab === "saved" ? "active" : ""}`}
            onClick={() => setHistoryTab("saved")}
          >
            Guardadas ({savedHistory.length})
          </button>
        </div>

        {currentList.length === 0 ? (
          <p className="admin-history-empty">Sin registros</p>
        ) : (
          <ul className="admin-history-list user-detail-history-list">
            {currentList.map((entry) => (
              <li key={entry.id} className="admin-history-item">
                <div className="admin-history-info">
                  <span className="song-title">{entry.title}</span>
                  <span className="song-artist">{entry.artist}</span>
                  {entry.album && <span className="song-album">{entry.album}</span>}
                </div>
                <div className="admin-history-meta">
                  <div className="song-links">
                    <a href={entry.spotifyUrl} target="_blank" rel="noopener noreferrer" className="song-link spotify-link" title="Spotify">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                      </svg>
                    </a>
                    <a href={entry.youtubeUrl} target="_blank" rel="noopener noreferrer" className="song-link youtube-link" title="YouTube">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                        <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                      </svg>
                    </a>
                  </div>
                  <span className="song-date">{formatDate(entry.timestamp)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
