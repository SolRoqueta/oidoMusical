import { createContext, useContext, useState, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const AuthContext = createContext(null);

async function fetchWithRetry(url, options = {}, retries = 2, delay = 3000) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      return res;
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem("oidoMusical_token"));
  const [loading, setLoading] = useState(true);
  const [backendReady, setBackendReady] = useState(false);

  // Wake up backend on mount (handles Render free-tier cold start)
  useEffect(() => {
    fetch(`${API_URL}/health`).then(() => setBackendReady(true)).catch(() => {
      // Retry once after 3s if backend is sleeping
      setTimeout(() => {
        fetch(`${API_URL}/health`).then(() => setBackendReady(true)).catch(() => setBackendReady(true));
      }, 3000);
    });
  }, []);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    fetchWithRetry(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => setUser(data.user))
      .catch(() => {
        localStorage.removeItem("oidoMusical_token");
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const loginWithGoogle = async (credential) => {
    let res;
    try {
      res = await fetchWithRetry(`${API_URL}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
    } catch {
      throw new Error("No se pudo conectar al servidor. Puede estar iniciando, intenta de nuevo en unos segundos.");
    }
    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error(`Error del servidor (${res.status}). Intenta de nuevo.`);
    }
    if (!res.ok) throw new Error(data.detail || "Error al iniciar sesión con Google");
    localStorage.setItem("oidoMusical_token", data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem("oidoMusical_token");
    setToken(null);
    setUser(null);
  };

  const refreshUser = (newToken, newUser) => {
    setToken(newToken);
    setUser(newUser);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, backendReady, loginWithGoogle, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
