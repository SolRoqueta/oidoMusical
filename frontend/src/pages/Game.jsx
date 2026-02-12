import { useState, useRef, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const WS_URL = (API_URL.replace(/^http/, "ws")) + "/game/ws";

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
  CONNECTING: "CONNECTING",
  LOBBY: "LOBBY",
  PLAYING: "PLAYING",
  THINKING: "THINKING",
  WATCHING: "WATCHING",
  ROUND_END: "ROUND_END",
  ERROR: "ERROR",
};

function getToken() {
  return localStorage.getItem("oidoMusical_token");
}

export default function Game() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [phase, setPhase] = useState(PHASES.CONNECTING);
  const [players, setPlayers] = useState([]);
  const [error, setError] = useState(null);
  const [songInfo, setSongInfo] = useState(null);
  const [progress, setProgress] = useState(0);
  const [thinkTime, setThinkTime] = useState(100);
  const [scores, setScores] = useState([]);
  const [stopperName, setStopperName] = useState(null);
  const [roundResult, setRoundResult] = useState(null); // "won" | "lost"
  const [winnerName, setWinnerName] = useState(null);
  const [canStop, setCanStop] = useState(true);
  const [genres, setGenres] = useState(null);
  const [selectedGenres, setSelectedGenres] = useState(new Set());
  const [loadingGenres, setLoadingGenres] = useState(false);

  const wsRef = useRef(null);
  const audioRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const thinkIntervalRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // ── Audio helpers ──

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
    audioRef.current = null;
  }, []);

  const playPreview = useCallback((url) => {
    stopGameAudio();
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
        }
      }, 100);
    }, { once: true });

    audio.addEventListener("error", () => {
      clearAllTimers();
    }, { once: true });

    audio.load();
  }, [clearAllTimers]);

  const playSongLoop = useCallback((url) => {
    stopGameAudio();
    const audio = new Audio(url);
    audio.loop = true;
    audioRef.current = audio;
    _activeAudio = audio;
    audio.play().catch(() => {});
  }, []);

  // ── Fetch genres for lobby ──

  const fetchGenres = useCallback(async () => {
    if (genres) return;
    setLoadingGenres(true);
    try {
      const token = getToken();
      const res = await fetch(`${API_URL}/game/genres`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGenres(data.genres);
    } catch {
      // Silently fail
    } finally {
      setLoadingGenres(false);
    }
  }, [genres]);

  // ── WebSocket send helper ──

  const wsSend = useCallback((msg) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // ── WebSocket connection ──

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setError("No autenticado");
      setPhase(PHASES.ERROR);
      return;
    }

    let previewUrlRef = null;

    function connect() {
      setPhase(PHASES.CONNECTING);
      const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        // Will receive state + players messages shortly
      };

      ws.onmessage = (event) => {
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        switch (data.type) {
          case "state":
            if (data.state === "LOBBY") {
              setPhase(PHASES.LOBBY);
            }
            break;

          case "players":
            setPlayers(data.players);
            // Update our own canStop from server state
            if (user) {
              const me = data.players.find((p) => p.id === user.id);
              if (me) setCanStop(me.canStop);
            }
            break;

          case "game_start":
            setPhase(PHASES.PLAYING);
            setSongInfo(null);
            setProgress(0);
            setThinkTime(100);
            setRoundResult(null);
            setWinnerName(null);
            setStopperName(null);
            setCanStop(true);
            previewUrlRef = data.previewUrl;
            playPreview(data.previewUrl);
            break;

          case "player_stopped":
            clearAllTimers();
            stopAudio();
            if (user && data.userId === user.id) {
              // I stopped — enter THINKING phase
              setPhase(PHASES.THINKING);
              setThinkTime(100);
              // Start 10s countdown locally
              const startTime = Date.now();
              const duration = 10000;
              thinkIntervalRef.current = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const pct = Math.max(100 - (elapsed / duration) * 100, 0);
                setThinkTime(pct);
                if (elapsed >= duration) {
                  clearInterval(thinkIntervalRef.current);
                  thinkIntervalRef.current = null;
                }
              }, 100);
            } else {
              // Someone else stopped — WATCHING
              setPhase(PHASES.WATCHING);
              setStopperName(data.username);
              setThinkTime(100);
              // Show countdown visually
              const startTime = Date.now();
              const duration = 10000;
              thinkIntervalRef.current = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const pct = Math.max(100 - (elapsed / duration) * 100, 0);
                setThinkTime(pct);
                if (elapsed >= duration) {
                  clearInterval(thinkIntervalRef.current);
                  thinkIntervalRef.current = null;
                }
              }, 100);
            }
            break;

          case "keep_listening":
            clearAllTimers();
            setPhase(PHASES.PLAYING);
            setStopperName(null);
            // The player who chose keep_listening loses their stop
            if (user && data.userId === user.id) {
              setCanStop(false);
            }
            // Resume playing audio
            if (previewUrlRef) {
              playPreview(previewUrlRef);
            }
            break;

          case "round_won":
            clearAllTimers();
            stopAudio();
            setPhase(PHASES.ROUND_END);
            setSongInfo(data.song);
            setScores(data.scores);
            setRoundResult("won");
            setWinnerName(data.winnerName);
            if (previewUrlRef) playSongLoop(previewUrlRef);
            break;

          case "round_lost":
            clearAllTimers();
            stopAudio();
            setPhase(PHASES.ROUND_END);
            setSongInfo(data.song);
            setScores(data.scores);
            setRoundResult("lost");
            setWinnerName(null);
            if (previewUrlRef) playSongLoop(previewUrlRef);
            break;

          case "back_to_lobby":
            clearAllTimers();
            stopAudio();
            setPhase(PHASES.LOBBY);
            setSongInfo(null);
            setProgress(0);
            setThinkTime(100);
            setRoundResult(null);
            setCanStop(true);
            break;

          case "error":
            setError(data.message);
            break;
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        clearAllTimers();
        stopAudio();
        // Try reconnecting after 2s
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 2000);
      };

      ws.onerror = () => {
        // onclose will fire after this
      };
    }

    connect();
    fetchGenres();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on unmount
        wsRef.current.close();
        wsRef.current = null;
      }
      clearAllTimers();
      stopAudio();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ──

  const toggleGenre = (id) => {
    setSelectedGenres((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleStart = () => {
    wsSend({ type: "start", genres: [...selectedGenres] });
  };

  const handleStop = () => {
    wsSend({ type: "stop" });
  };

  const handleKeepListening = () => {
    clearAllTimers();
    wsSend({ type: "keep_listening" });
  };

  const handleGiveUp = () => {
    clearAllTimers();
    wsSend({ type: "give_up" });
  };

  const handleNextRound = () => {
    wsSend({ type: "next_round" });
  };

  const handleBackToLobby = () => {
    wsSend({ type: "back_to_lobby" });
  };

  // ── Render ──

  return (
    <div className="game-page">
      <div className="game-card game-card-multi">

        {/* CONNECTING */}
        {phase === PHASES.CONNECTING && (
          <>
            <div className="game-loading-spinner"></div>
            <p className="game-prompt">Conectando...</p>
          </>
        )}

        {/* LOBBY */}
        {phase === PHASES.LOBBY && (
          <>
            <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="game-icon-big">
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
            <h1>Adivina la Cancion</h1>
            <p className="subtitle">Modo Multijugador</p>

            {/* Player list */}
            <div className="game-players-section">
              <p className="game-players-title">Jugadores conectados ({players.length})</p>
              <div className="game-players-list">
                {players.map((p) => (
                  <div key={p.id} className={`game-player-chip${p.role === "admin" ? " admin" : ""}`}>
                    <span className="game-player-name">{p.username}</span>
                    {p.role === "admin" && <span className="game-admin-badge">Admin</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Genre selection — admin only */}
            {isAdmin && (
              <>
                <p className="game-genres-label">Selecciona categorias:</p>
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
                <button
                  className="btn btn-record"
                  onClick={handleStart}
                  disabled={players.length < 1}
                >
                  Empezar
                </button>
              </>
            )}

            {!isAdmin && (
              <p className="game-waiting-text">Esperando que el admin inicie la partida...</p>
            )}
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

            {/* Player chips */}
            <div className="game-players-list game-players-inline">
              {players.map((p) => (
                <div
                  key={p.id}
                  className={`game-player-chip mini${!p.canStop ? " eliminated" : ""}`}
                >
                  {p.username}
                  {!p.canStop && <span className="game-status-dot red"></span>}
                </div>
              ))}
            </div>

            {canStop ? (
              <button className="btn game-btn-parar" onClick={handleStop}>PARAR</button>
            ) : (
              <p className="game-hint">Ya usaste tu PARAR en esta ronda</p>
            )}
          </>
        )}

        {/* THINKING — I stopped */}
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

        {/* WATCHING — someone else stopped */}
        {phase === PHASES.WATCHING && (
          <>
            <div className="game-listening">
              <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <p className="game-waiting-text">{stopperName} esta pensando...</p>
            <div className="game-replay">
              <div className="game-progress-bar game-progress-countdown">
                <div className="game-progress-fill" style={{ width: `${thinkTime}%` }}></div>
              </div>
            </div>
          </>
        )}

        {/* ROUND_END */}
        {phase === PHASES.ROUND_END && (
          <>
            <div className="game-result">
              {roundResult === "won" ? (
                <>
                  <div className="game-result-icon correct">
                    <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  </div>
                  <p className="game-congrats">{winnerName} adivino!</p>
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

            {/* Song card */}
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

            {/* Sound wave */}
            <div className="game-sound-wave">
              <div className="game-wave-bar"></div>
              <div className="game-wave-bar"></div>
              <div className="game-wave-bar"></div>
              <div className="game-wave-bar"></div>
              <div className="game-wave-bar"></div>
            </div>

            {/* Scoreboard */}
            {scores.length > 0 && (
              <div className="game-scoreboard">
                <p className="game-scoreboard-title">Puntuaciones</p>
                {scores.map((s, i) => (
                  <div key={s.id} className={`game-scoreboard-row${i === 0 ? " first" : ""}`}>
                    <span className="game-scoreboard-rank">#{i + 1}</span>
                    <span className="game-scoreboard-name">{s.username}</span>
                    <span className="game-scoreboard-points">{s.score} pts</span>
                  </div>
                ))}
              </div>
            )}

            {/* Admin controls */}
            {isAdmin && (
              <div className="game-round-end-buttons">
                <button className="btn btn-record" onClick={handleNextRound}>Siguiente cancion</button>
                <button className="btn game-btn-rindo" onClick={handleBackToLobby}>Volver al lobby</button>
              </div>
            )}
            {!isAdmin && (
              <p className="game-waiting-text">Esperando al admin...</p>
            )}
          </>
        )}

        {/* ERROR */}
        {phase === PHASES.ERROR && (
          <>
            <p className="status error">{error}</p>
            <button className="btn btn-record" onClick={() => window.location.reload()}>Reintentar</button>
          </>
        )}

        {/* Floating error toast */}
        {error && phase !== PHASES.ERROR && (
          <p className="game-error-toast" onClick={() => setError(null)}>{error}</p>
        )}
      </div>
    </div>
  );
}
