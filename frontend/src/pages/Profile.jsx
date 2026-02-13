import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getFriends } from "../utils/social";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const AVATARS = [
  { id: "default", emoji: "\ud83d\udc64" },
  { id: "cat", emoji: "\ud83d\udc31" },
  { id: "dog", emoji: "\ud83d\udc36" },
  { id: "fox", emoji: "\ud83e\udd8a" },
  { id: "panda", emoji: "\ud83d\udc3c" },
  { id: "owl", emoji: "\ud83e\udd89" },
  { id: "rabbit", emoji: "\ud83d\udc30" },
  { id: "bear", emoji: "\ud83d\udc3b" },
  { id: "koala", emoji: "\ud83d\udc28" },
  { id: "penguin", emoji: "\ud83d\udc27" },
  { id: "music", emoji: "\ud83c\udfb5" },
  { id: "headphones", emoji: "\ud83c\udfa7" },
];

export function getAvatarEmoji(avatarId) {
  return AVATARS.find((a) => a.id === avatarId)?.emoji || "\ud83d\udc64";
}

export default function Profile() {
  const { user, token, refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(user?.username || "");
  const [selectedAvatar, setSelectedAvatar] = useState(user?.avatar || "default");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [saving, setSaving] = useState(false);
  const [friendsCount, setFriendsCount] = useState(0);

  useEffect(() => {
    getFriends().then((f) => setFriendsCount(f.length));
  }, []);

  const handleEdit = () => {
    setEditing(true);
    setError(null);
    setSuccess(null);
  };

  const handleCancel = () => {
    setEditing(false);
    setUsername(user.username);
    setSelectedAvatar(user.avatar || "default");
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);

    const body = {};
    if (username !== user.username) body.username = username;
    if (selectedAvatar !== (user.avatar || "default")) body.avatar = selectedAvatar;

    if (Object.keys(body).length === 0) {
      setError("No hay cambios para guardar");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`${API_URL}/auth/profile`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail);
      localStorage.setItem("oidoMusical_token", data.token);
      refreshUser(data.token, data.user);
      setSuccess("Perfil actualizado correctamente");
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div className="profile-page">
      <div className="profile-card">
        <Link to="/" className="user-detail-back">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
          Volver
        </Link>

        <h2 className="auth-title">Mi Perfil</h2>

        <div className="profile-avatar-current">
          <span className="profile-avatar-big">{getAvatarEmoji(editing ? selectedAvatar : (user.avatar || "default"))}</span>
        </div>

        {editing ? (
          <>
            <div className="profile-avatar-grid">
              {AVATARS.map((a) => (
                <button
                  key={a.id}
                  className={`profile-avatar-option ${selectedAvatar === a.id ? "selected" : ""}`}
                  onClick={() => setSelectedAvatar(a.id)}
                  type="button"
                  title={a.id}
                >
                  {a.emoji}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="profile-field">
                <label className="profile-label">Nombre de usuario</label>
                <input
                  type="text"
                  className="auth-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="profile-field">
                <label className="profile-label">Email (de Google)</label>
                <input
                  type="email"
                  className="auth-input"
                  value={user.email}
                  disabled
                />
              </div>

              {error && <p className="auth-error">{error}</p>}
              {success && <p className="profile-success">{success}</p>}

              <div className="profile-buttons">
                <button type="submit" className="btn btn-auth" disabled={saving}>
                  {saving ? "Guardando..." : "Guardar cambios"}
                </button>
                <button type="button" className="btn-profile-cancel" onClick={handleCancel}>
                  Cancelar
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="profile-view">
            <div className="profile-info">
              <div className="profile-field-view">
                <span className="profile-label">Nombre de usuario</span>
                <span className="profile-value">{user.username}</span>
              </div>
              <div className="profile-field-view">
                <span className="profile-label">Email</span>
                <span className="profile-value">{user.email}</span>
              </div>
              <div className="profile-field-view">
                <span className="profile-label">Rol</span>
                <span className={`admin-role ${user.role}`}>{user.role}</span>
              </div>
              <div className="profile-field-view">
                <span className="profile-label">Amigos</span>
                <Link to="/friends" className="profile-friends-link">
                  {friendsCount} {friendsCount === 1 ? "amigo" : "amigos"}
                </Link>
              </div>
            </div>

            {success && <p className="profile-success">{success}</p>}

            <button className="btn btn-auth" onClick={handleEdit}>
              Editar perfil
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
