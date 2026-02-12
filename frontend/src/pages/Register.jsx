import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register(username, email, password);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor">
            <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
          </svg>
        </div>
        <h2 className="auth-title">Crear Cuenta</h2>
        <form onSubmit={handleSubmit} className="auth-form">
          <input
            type="text"
            className="auth-input"
            placeholder="Nombre de usuario"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            type="email"
            className="auth-input"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            className="auth-input"
            placeholder="Contraseña (mínimo 6 caracteres)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="btn btn-auth" disabled={submitting}>
            {submitting ? "Creando cuenta..." : "Registrarse"}
          </button>
        </form>
        <p className="auth-footer">
          ¿Ya tienes cuenta? <Link to="/login" className="auth-link">Inicia sesión</Link>
        </p>
      </div>
    </div>
  );
}
