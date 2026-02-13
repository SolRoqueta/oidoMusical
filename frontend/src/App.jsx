import { useState, useCallback, useEffect } from "react";
import { Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import AudioRecorder from "./components/AudioRecorder";
import SearchHistory from "./components/SearchHistory";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Admin from "./pages/Admin";
import UserDetail from "./pages/UserDetail";
import Profile, { getAvatarEmoji } from "./pages/Profile";
import Game, { stopGameAudio } from "./pages/Game";
import Friends from "./pages/Friends";
import PublicProfile from "./pages/PublicProfile";
import "./App.css";

function App() {
  const [historyVersion, setHistoryVersion] = useState(0);
  const [dark, setDark] = useState(() => localStorage.getItem("oidoMusical_theme") === "dark");
  const { user, logout } = useAuth();
  const location = useLocation();

  // Stop game audio when navigating away from /game
  useEffect(() => {
    if (location.pathname !== "/game") {
      stopGameAudio();
    }
  }, [location.pathname]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    localStorage.setItem("oidoMusical_theme", dark ? "dark" : "light");
  }, [dark]);

  const handleHistoryUpdate = useCallback(() => {
    setHistoryVersion((v) => v + 1);
  }, []);

  return (
    <>
      <nav className="navbar">
        <div className="navbar-inner">
          {user ? (
            <div className="navbar-user">
              <Link to="/profile" className="navbar-user-link" title="Mi perfil">
                <span className="navbar-avatar">{getAvatarEmoji(user.avatar)}</span>
                <span>{user.username}</span>
              </Link>
              <Link to="/" className="btn-home" title="Inicio">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
                </svg>
              </Link>
              <Link to="/game" className="btn-game" title="Juego Musical">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 12h4m-2-2v4m6.5-1.5h.01M18 11h.01" />
                  <rect x="2" y="6" width="20" height="12" rx="4" />
                </svg>
              </Link>
              <Link to="/friends" className="btn-friends" title="Amigos">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                </svg>
              </Link>
              <button className="btn-logout" onClick={logout} title="Cerrar sesión">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
                </svg>
              </button>
            </div>
          ) : (
            <span className="navbar-title">OidoMusical</span>
          )}
          <div className="theme-switch" onClick={() => setDark((d) => !d)} title={dark ? "Modo claro" : "Modo oscuro"}>
            <div className={`theme-switch-track ${dark ? "dark" : ""}`}>
              <span className="theme-switch-icon sun">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <circle cx="12" cy="12" r="5" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </span>
              <span className="theme-switch-icon moon">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
                </svg>
              </span>
              <div className="theme-switch-thumb" />
            </div>
          </div>
        </div>
      </nav>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              {user?.role === "admin" ? (
                <Navigate to="/admin" replace />
              ) : (
                <div className="app">
                  <div className="main-panel">
                    <h1>OidoMusical</h1>
                    <p className="subtitle">Tararea una canción y descubre su nombre</p>
                    <AudioRecorder onHistoryUpdate={handleHistoryUpdate} />
                  </div>
                  <SearchHistory refreshKey={historyVersion} onClear={handleHistoryUpdate} />
                </div>
              )}
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              {user?.role === "admin" ? <Admin /> : <Navigate to="/" replace />}
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/user/:userId"
          element={
            <ProtectedRoute>
              {user?.role === "admin" ? <UserDetail /> : <Navigate to="/" replace />}
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/game"
          element={
            <ProtectedRoute>
              <Game />
            </ProtectedRoute>
          }
        />
        <Route
          path="/friends"
          element={
            <ProtectedRoute>
              <Friends />
            </ProtectedRoute>
          }
        />
        <Route
          path="/user/:userId"
          element={
            <ProtectedRoute>
              <PublicProfile />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;
