import { useState, useRef, useEffect } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

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

  const sessionTokenRef = useRef(null);
  const previewUrlRef = useRef(null);
  const audioRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const thinkIntervalRef = useRef(null);

  useEffect(() => {
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
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
  };

  // Play song in loop (for reveal phase)
  const playSongLoop = (url) => {
    stopAudio();
    const audio = new Audio(url);
    audio.loop = true;
    audioRef.current = audio;
    audio.play().catch(() => {});
  };

  // STEP 1: Fetch random song
  const handleStart = async () => {
    setPhase(PHASES.LOADING_SONG);
    setError(null);
    setSongInfo(null);
    setProgress(0);
    setThinkTime(100);
    setWon(false);
    stopAudio();
    clearAllTimers();

    try {
      const res = await fetch(`${API_URL}/game/song`, { headers: authHeaders() });
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

  // STEP 2: Play 15s preview
  const playPreview = (url) => {
    stopAudio();
    setPhase(PHASES.PLAYING);
    setProgress(0);

    const audio = new Audio(url);
    audioRef.current = audio;
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
        {/* IDLE */}
        {phase === PHASES.IDLE && (
          <>
            <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="game-icon-big">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <h1>Adivina la Cancion</h1>
            <p className="subtitle">Escucha la cancion y adivina cual es</p>
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
            <button className="btn btn-record" onClick={handleStart}>Jugar de nuevo</button>
          </>
        )}

        {/* ERROR */}
        {phase === PHASES.ERROR && (
          <>
            <p className="status error">{error}</p>
            <button className="btn btn-record" onClick={handleStart}>Reintentar</button>
          </>
        )}
      </div>
    </div>
  );
}
