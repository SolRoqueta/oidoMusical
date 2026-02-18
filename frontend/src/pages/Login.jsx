import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { loginWithGoogle, backendReady } = useAuth();
  const navigate = useNavigate();

  const handleGoogleSuccess = async (credentialResponse) => {
    setError(null);
    setSubmitting(true);
    try {
      await loginWithGoogle(credentialResponse.credential);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleError = () => {
    setError("Error al iniciar sesión con Google. Intenta de nuevo.");
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="currentColor">
            <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
          </svg>
        </div>
        <h2 className="auth-title">OidoMusical</h2>
        <p className="auth-subtitle">Tararea una canción y descubre su nombre</p>

        {!backendReady && (
          <p className="auth-loading">Conectando con el servidor...</p>
        )}

        {error && <p className="auth-error">{error}</p>}

        <div className="google-login-wrapper">
          {submitting ? (
            <p className="auth-loading">Iniciando sesión...</p>
          ) : (
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={handleGoogleError}
              theme="outline"
              size="large"
              text="signin_with"
              shape="rectangular"
              width="300"
            />
          )}
        </div>
      </div>
    </div>
  );
}
