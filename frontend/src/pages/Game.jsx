import { useState, useRef, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Module-level audio ref so it can be stopped from outside (e.g. route change)
let _activeAudio = null;
export function stopGameAudio() {
  if (_activeAudio) {
    _activeAudio.pause();
    _activeAudio.onended = null;
    _activeAudio.onerror = null;
    _activeAudio = null;
  }
}

const PHASES = {
  IDLE: "IDLE",
  LOADING_SONG: "LOADING_SONG",
  PLAYING: "PLAYING",
  THINKING: "THINKING",
  REVEAL: "REVEAL",
  ERROR: "ERROR",
};

function getToken() {
  return localStorage.getItem("oidoMusical_token");
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function Game() {
  const [phase, setPhase] = useState(PHASES.IDLE);
  const [error, setError] = useState(null);
  const [songInfo, setSongInfo] = useState(null);
  const [progress, setProgress] = useState(0);
  const [thinkTime, setThinkTime] = useState(100);
  const [won, setWon] = useState(false);
  const [score, setScore] = useState(0);
  const [genres, setGenres] = useState(null);
  const [loadingGenres, setLoadingGenres] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState(new Set());

  const sessionTokenRef = useRef(null);
  const previewUrlRef = useRef(null);
  const audioRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const thinkIntervalRef = useRef(null);

  useEffect(() => {
    fetchGenres();
    return () => {
      stopAudio();
      clearAllTimers();
    };
  }, []);


  const clearAllTimers = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (thinkIntervalRef.current) {
      clearInterval(thinkIntervalRef.current);
      thinkIntervalRef.current = null;
    }
  };

  const stopAudio = () => {
    stopGameAudio();
    audioRef.current = null;
  };

  // Play song in loop (for reveal phase)
  const playSongLoop = (url) => {
    stopAudio();
    const audio = new Audio(url);
    audio.loop = true;
    audioRef.current = audio;
    _activeAudio = audio;
    audio.play().catch(() => {});
  };

  // Fetch genres list (called on mount)
  const fetchGenres = async () => {
    if (genres) return;
    setLoadingGenres(true);
    try {
      const res = await fetch(`${API_URL}/game/genres`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Error al obtener géneros");
      const data = await res.json();
      setGenres(data.genres);
    } catch {
      // Silently fail — user can still play with "Todas"
    } finally {
      setLoadingGenres(false);
    }
  };

  const toggleGenre = (id) => {
    setSelectedGenres((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Fetch a song from one of the selected genres
  const fetchSong = async () => {
    const ids = [...selectedGenres];
    const genreId = ids.length > 0 ? ids[Math.floor(Math.random() * ids.length)] : 0;
    setPhase(PHASES.LOADING_SONG);
    setError(null);
    setSongInfo(null);
    setProgress(0);
    setThinkTime(100);
    setWon(false);
    stopAudio();
    clearAllTimers();

    try {
      const res = await fetch(`${API_URL}/game/song?genre_id=${genreId}`, { headers: authHeaders() });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Error al obtener cancion");
      }
      const data = await res.json();
      sessionTokenRef.current = data.sessionToken;
      previewUrlRef.current = data.previewUrl;
      playPreview(data.previewUrl);
    } catch (e) {
      setError(e.message);
      setPhase(PHASES.ERROR);
    }
  };

  // "Empezar" from IDLE — resets score
  const handleStart = () => {
    setScore(0);
    fetchSong();
  };

  // "Jugar de nuevo" from REVEAL — keeps score
  const handleNextSong = () => {
    fetchSong();
  };

  // STEP 2: Play 15s preview
  const playPreview = (url) => {
    stopAudio();
    setPhase(PHASES.PLAYING);
    setProgress(0);

    const audio = new Audio(url);
    audioRef.current = audio;
    _activeAudio = audio;
    const startTime = Date.now();
    const duration = 20000;

    audio.addEventListener("canplaythrough", () => {
      audio.play().catch(() => {});

      progressIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const pct = Math.min((elapsed / duration) * 100, 100);
        setProgress(pct);

        if (elapsed >= duration) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
          audio.pause();
          audioRef.current = null;
          revealSong();
        }
      }, 100);
    }, { once: true });

    audio.addEventListener("ended", () => {
      clearAllTimers();
      audioRef.current = null;
      revealSong();
    }, { once: true });

    audio.addEventListener("error", () => {
      clearAllTimers();
      setError("Error al reproducir la cancion");
      setPhase(PHASES.ERROR);
    }, { once: true });

    audio.load();
  };

  // STEP 3: PARAR → 10s thinking time
  const handleStop = () => {
    stopAudio();
    clearAllTimers();
    setProgress(0);
    setThinkTime(100);
    setPhase(PHASES.THINKING);

    const startTime = Date.now();
    const duration = 10000;

    thinkIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.max(100 - (elapsed / duration) * 100, 0);
      setThinkTime(pct);

      if (elapsed >= duration) {
        clearInterval(thinkIntervalRef.current);
        thinkIntervalRef.current = null;
        setWon(true);
        setScore((s) => s + 1);
        revealSong();
      }
    }, 100);
  };

  // "Seguir escuchando" → back to playing
  const handleKeepListening = () => {
    clearAllTimers();
    playPreview(previewUrlRef.current);
  };

  // "Me rindo" → reveal immediately
  const handleGiveUp = () => {
    clearAllTimers();
    revealSong();
  };

  // Reveal song + play it on loop
  const revealSong = async () => {
    if (!sessionTokenRef.current) return;
    clearAllTimers();

    try {
      const token = getToken();
      const res = await fetch(
        `${API_URL}/game/reveal?sessionToken=${encodeURIComponent(sessionTokenRef.current)}`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Error al revelar cancion");
      }
      const data = await res.json();
      setSongInfo(data.song);
      sessionTokenRef.current = null;
      setPhase(PHASES.REVEAL);
      playSongLoop(previewUrlRef.current);
    } catch (e) {
      setError(e.message);
      setPhase(PHASES.ERROR);
    }
  };

  return (
    <div className="game-page">
      <div className="game-card">
        {/* Score indicator */}
        {phase !== PHASES.IDLE && (
          <div className="game-score">Puntos: {score}</div>
        )}

        {/* IDLE — genre selection + start */}
        {phase === PHASES.IDLE && (
          <>
            <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="game-icon-big">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <h1>Adivina la Cancion</h1>
            <p className="subtitle">Elige una categoria y presiona Empezar</p>
            {loadingGenres ? (
              <div className="game-loading-spinner"></div>
            ) : (
              <div className="game-genres-grid">
                <button
                  className={`game-genre-card${selectedGenres.size === 0 ? " game-genre-selected" : ""}`}
                  onClick={() => setSelectedGenres(new Set())}
                >
                  Todas
                </button>
                {genres && genres.map((g) => (
                  <button
                    key={g.id}
                    className={`game-genre-card${selectedGenres.has(g.id) ? " game-genre-selected" : ""}`}
                    onClick={() => toggleGenre(g.id)}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            )}
            <button className="btn btn-record" onClick={handleStart}>Empezar</button>
          </>
        )}

        {/* LOADING */}
        {phase === PHASES.LOADING_SONG && (
          <>
            <div className="game-loading-spinner"></div>
            <p className="game-prompt">Preparando cancion...</p>
          </>
        )}

        {/* PLAYING (15s) */}
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

        {/* THINKING (10s countdown) */}
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
              <button className="btn game-btn-rindo" onClick={handleGiveUp}>Me rindo</button>
            </div>
          </>
        )}

        {/* REVEAL — plays song on loop */}
        {phase === PHASES.REVEAL && songInfo && (
          <>
            <div className="game-result">
              {won ? (
                <>
                  <div className="game-result-icon correct">
                    <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  </div>
                  <p className="game-congrats">Felicidades!</p>
                </>
              ) : (
                <>
                  <div className="game-result-icon reveal">
                    <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18V5l12-2v13" />
                      <circle cx="6" cy="18" r="3" />
                      <circle cx="18" cy="16" r="3" />
                    </svg>
                  </div>
                  <p className="game-congrats">La cancion era:</p>
                </>
              )}
            </div>
            <div className="game-song-card">
              {songInfo.cover && <img src={songInfo.cover} alt="Cover" className="game-song-cover" />}
              <div className="game-song-info">
                <span className="game-song-title">{songInfo.title}</span>
                <span className="game-song-artist">{songInfo.artist}</span>
                {songInfo.album && <span className="game-song-album">{songInfo.album}</span>}
              </div>
            </div>
            <div className="game-sound-wave">
              <div className="game-wave-bar"></div>
              <div className="game-wave-bar"></div>
              <div className="game-wave-bar"></div>
              <div className="game-wave-bar"></div>
              <div className="game-wave-bar"></div>
            </div>
            <button className="btn btn-record" onClick={handleNextSong}>Jugar de nuevo</button>
            <button className="btn game-btn-rindo" onClick={() => { stopAudio(); setPhase(PHASES.IDLE); }} style={{ marginTop: "0.5rem" }}>Cambiar categoria</button>
          </>
        )}

        {/* ERROR */}
        {phase === PHASES.ERROR && (
          <>
            <p className="status error">{error}</p>
            <button className="btn btn-record" onClick={() => setPhase(PHASES.IDLE)}>Reintentar</button>
          </>
        )}
      </div>
    </div>
  );
}
