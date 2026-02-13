import { useState, useRef, useCallback, useEffect } from "react";
import { Link } from "react-router-dom";
import { stopGameAudio } from "./Game";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function getToken() {
  return localStorage.getItem("oidoMusical_token");
}

const PHASES = {
  GENRE_SELECT: "GENRE_SELECT",
  PLAYING: "PLAYING",
  THINKING: "THINKING",
  REVEAL: "REVEAL",
};

// Reuse module-level audio ref from Game.jsx via stopGameAudio
let _activeAudio = null;

export default function SoloGame() {
  const [phase, setPhase] = useState(PHASES.GENRE_SELECT);
  const [genres, setGenres] = useState(null);
  const [loadingGenres, setLoadingGenres] = useState(true);
  const [selectedGenre, setSelectedGenre] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [sessionToken, setSessionToken] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [progress, setProgress] = useState(0);
  const [thinkTime, setThinkTime] = useState(100);
  const [songInfo, setSongInfo] = useState(null);

  const audioRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const thinkIntervalRef = useRef(null);

  // ── Helpers ──

  const clearAllTimers = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (thinkIntervalRef.current) {
      clearInterval(thinkIntervalRef.current);
      thinkIntervalRef.current = null;
    }
  }, []);

  const stopAudio = useCallback(() => {
    stopGameAudio();
    if (_activeAudio) {
      _activeAudio.pause();
      _activeAudio.onended = null;
      _activeAudio.onerror = null;
      _activeAudio = null;
    }
    audioRef.current = null;
  }, []);

  const playPreview = useCallback((url) => {
    stopAudio();
    const audio = new Audio(url);
    audioRef.current = audio;
    _activeAudio = audio;
    const startTime = Date.now();
    const duration = 30000;

    audio.addEventListener("canplaythrough", () => {
      audio.play().catch(() => {});

      progressIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const pct = Math.min((elapsed / duration) * 100, 100);
        setProgress(pct);

        if (elapsed >= duration) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
      }, 100);
    }, { once: true });

    audio.addEventListener("error", () => {
      clearAllTimers();
    }, { once: true });

    audio.load();
  }, [stopAudio, clearAllTimers]);

  const playSongLoop = useCallback((url) => {
    stopAudio();
    const audio = new Audio(url);
    audio.loop = true;
    audioRef.current = audio;
    _activeAudio = audio;
    audio.play().catch(() => {});
  }, [stopAudio]);

  // ── Cleanup on unmount ──

  useEffect(() => {
    return () => {
      clearAllTimers();
      stopAudio();
    };
  }, [clearAllTimers, stopAudio]);

  // ── Fetch genres on mount ──

  useEffect(() => {
    async function load() {
      try {
        const token = getToken();
        const res = await fetch(`${API_URL}/game/genres`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setGenres(data.genres);
      } catch {
        setError("No se pudieron cargar los generos");
      } finally {
        setLoadingGenres(false);
      }
    }
    load();
  }, []);

  // ── Actions ──

  const handlePlay = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getToken();
      const url = selectedGenre
        ? `${API_URL}/game/song?genre_id=${selectedGenre}`
        : `${API_URL}/game/song`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("No hay canciones disponibles");
      const data = await res.json();
      setSessionToken(data.sessionToken);
      setPreviewUrl(data.previewUrl);
      setProgress(0);
      setThinkTime(100);
      setSongInfo(null);
      setPhase(PHASES.PLAYING);
      playPreview(data.previewUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = () => {
    clearAllTimers();
    stopAudio();
    setPhase(PHASES.THINKING);
    setThinkTime(100);

    const startTime = Date.now();
    const duration = 10000;
    thinkIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.max(100 - (elapsed / duration) * 100, 0);
      setThinkTime(pct);
      if (elapsed >= duration) {
        clearInterval(thinkIntervalRef.current);
        thinkIntervalRef.current = null;
        handleReveal();
      }
    }, 100);
  };

  const handleKeepListening = () => {
    clearAllTimers();
    setPhase(PHASES.PLAYING);
    if (previewUrl) {
      playPreview(previewUrl);
    }
  };

  const handleReveal = async () => {
    clearAllTimers();
    stopAudio();
    setPhase(PHASES.REVEAL);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/game/reveal?sessionToken=${encodeURIComponent(sessionToken)}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Error al revelar la cancion");
      const data = await res.json();
      setSongInfo(data.song);
      if (previewUrl) playSongLoop(previewUrl);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleNextSong = async () => {
    clearAllTimers();
    stopAudio();
    setLoading(true);
    setError(null);
    try {
      const token = getToken();
      const url = selectedGenre
        ? `${API_URL}/game/song?genre_id=${selectedGenre}`
        : `${API_URL}/game/song`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("No hay canciones disponibles");
      const data = await res.json();
      setSessionToken(data.sessionToken);
      setPreviewUrl(data.previewUrl);
      setProgress(0);
      setThinkTime(100);
      setSongInfo(null);
      setPhase(PHASES.PLAYING);
      playPreview(data.previewUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangeGenre = () => {
    clearAllTimers();
    stopAudio();
    setPhase(PHASES.GENRE_SELECT);
    setSongInfo(null);
    setSessionToken(null);
    setPreviewUrl(null);
    setProgress(0);
    setThinkTime(100);
  };

  // ── Render ──

  return (
    <div className="game-page">
      <div className="game-card">

        {/* GENRE SELECT */}
        {phase === PHASES.GENRE_SELECT && (
          <>
            <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="game-icon-big">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <h1>Modo Solitario</h1>
            <p className="subtitle">Escucha y adivina la cancion</p>

            <Link to="/game" className="game-back-link">Volver a salas</Link>

            {loadingGenres ? (
              <div className="game-loading-spinner"></div>
            ) : (
              <>
                <p className="game-genres-label">Selecciona un genero:</p>
                <div className="game-genres-grid">
                  <button
                    className={`game-genre-card${selectedGenre === 0 ? " game-genre-selected" : ""}`}
                    onClick={() => setSelectedGenre(0)}
                  >
                    Todas
                  </button>
                  {genres && genres.map((g) => (
                    <button
                      key={g.id}
                      className={`game-genre-card${selectedGenre === g.id ? " game-genre-selected" : ""}`}
                      onClick={() => setSelectedGenre(g.id)}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
                <button
                  className="btn btn-record"
                  onClick={handlePlay}
                  disabled={loading}
                  style={{ marginTop: "1rem" }}
                >
                  {loading ? "Cargando..." : "Jugar"}
                </button>
              </>
            )}

            {error && <p className="auth-error">{error}</p>}
          </>
        )}

        {/* PLAYING */}
        {phase === PHASES.PLAYING && (
          <>
            <div className="game-sound-wave">
              <div className="game-wave-bar"></div>
              <div className="game-wave-bar"></div>
              <div className="game-wave-bar"></div>
              <div className="game-wave-bar"></div>
              <div className="game-wave-bar"></div>
            </div>
            <p className="game-prompt">Escuchando... presiona PARAR cuando sepas la cancion</p>
            <div className="game-replay">
              <div className="game-progress-bar">
                <div className="game-progress-fill" style={{ width: `${progress}%` }}></div>
              </div>
            </div>
            <button className="btn game-btn-parar" onClick={handleStop}>PARAR</button>
          </>
        )}

        {/* THINKING */}
        {phase === PHASES.THINKING && (
          <>
            <div className="game-listening">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <p className="game-prompt">Piensa tu respuesta...</p>
            <div className="game-replay">
              <div className="game-progress-bar game-progress-countdown">
                <div className="game-progress-fill" style={{ width: `${thinkTime}%` }}></div>
              </div>
            </div>
            <div className="game-thinking-buttons">
              <button className="btn btn-record" onClick={handleKeepListening}>Seguir escuchando</button>
              <button className="btn game-btn-rindo" onClick={handleReveal}>Me rindo</button>
            </div>
          </>
        )}

        {/* REVEAL */}
        {phase === PHASES.REVEAL && (
          <>
            <div className="game-result">
              <div className="game-result-icon reveal">
                <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              </div>
              <p className="game-congrats">La cancion era:</p>
            </div>

            {songInfo && (
              <div className="game-song-card">
                {songInfo.cover && <img src={songInfo.cover} alt="Cover" className="game-song-cover" />}
                <div className="game-song-info">
                  <span className="game-song-title">{songInfo.title}</span>
                  <span className="game-song-artist">{songInfo.artist}</span>
                  {songInfo.album && <span className="game-song-album">{songInfo.album}</span>}
                </div>
              </div>
            )}

            <div className="game-sound-wave">
              <div className="game-wave-bar"></div>
              <div className="game-wave-bar"></div>
              <div className="game-wave-bar"></div>
              <div className="game-wave-bar"></div>
              <div className="game-wave-bar"></div>
            </div>

            <div className="game-solo-actions">
              <button className="btn btn-record" onClick={handleNextSong} disabled={loading}>
                {loading ? "Cargando..." : "Siguiente cancion"}
              </button>
              <button className="btn game-btn-rindo" onClick={handleChangeGenre}>
                Cambiar genero
              </button>
            </div>

            {error && <p className="auth-error">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
