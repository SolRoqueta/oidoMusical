import { useState, useEffect, useCallback } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getAvatarEmoji } from "./Profile";
import { getPublicProfile, sendFriendRequest, removeFriend } from "../utils/social";

export default function PublicProfile() {
  const { userId } = useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      const data = await getPublicProfile(userId);
      setProfile(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSendRequest = async () => {
    setActionLoading(true);
    try {
      await sendFriendRequest(profile.id);
      await loadProfile();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveFriend = async () => {
    setActionLoading(true);
    try {
      await removeFriend(profile.friendshipId);
      await loadProfile();
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  if (!user) return null;

  if (loading) {
    return (
      <div className="friends-page">
        <div className="friends-card">
          <p className="admin-history-empty">Cargando perfil...</p>
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="friends-page">
        <div className="friends-card">
          <Link to="/friends" className="user-detail-back">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
            Volver
          </Link>
          <p className="auth-error">{error}</p>
        </div>
      </div>
    );
  }

  if (profile.isOwnProfile) {
    return <Navigate to="/profile" replace />;
  }

  const memberSince = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString("es-ES", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Desconocido";

  return (
    <div className="friends-page">
      <div className="friends-card">
        <Link to="/friends" className="user-detail-back">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
          Volver a Amigos
        </Link>

        <div className="public-profile-header">
          <span className="public-profile-avatar">
            {getAvatarEmoji(profile.avatar)}
          </span>
          <h2 className="public-profile-username">{profile.username}</h2>
        </div>

        <div className="public-profile-stats">
          <div className="public-profile-stat">
            <span className="public-profile-stat-label">Miembro desde</span>
            <span className="public-profile-stat-value">{memberSince}</span>
          </div>
          <div className="public-profile-stat">
            <span className="public-profile-stat-label">Canciones buscadas</span>
            <span className="public-profile-stat-value">{profile.searchCount}</span>
          </div>
          <div className="public-profile-stat">
            <span className="public-profile-stat-label">Amigos</span>
            <span className="public-profile-stat-value">{profile.friends.length}</span>
          </div>
        </div>

        {error && <p className="auth-error">{error}</p>}

        {profile.role !== "admin" && <div className="public-profile-action">
          {profile.friendshipStatus === "accepted" ? (
            <button
              className="btn-friend-remove-lg"
              onClick={handleRemoveFriend}
              disabled={actionLoading}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
              Eliminar amigo
            </button>
          ) : profile.friendshipStatus === "pending_sent" ? (
            <span className="btn-friend-status pending">Solicitud enviada</span>
          ) : profile.friendshipStatus === "pending_received" ? (
            <span className="btn-friend-status pending">Te envio una solicitud</span>
          ) : (
            <button
              className="btn-friend-add-lg"
              onClick={handleSendRequest}
              disabled={actionLoading}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
              Agregar amigo
            </button>
          )}
        </div>}

        {profile.friends.length > 0 && (
          <div className="public-profile-friends">
            <h3 className="public-profile-friends-title">Amigos ({profile.friends.length})</h3>
            <div className="public-profile-friends-grid">
              {profile.friends.map((f) => (
                <Link
                  key={f.id}
                  to={f.id === user.id ? "/profile" : `/user/${f.id}`}
                  className="public-profile-friend-chip"
                >
                  <span>{getAvatarEmoji(f.avatar)}</span>
                  <span>{f.username}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
