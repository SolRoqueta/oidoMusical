import { useState, useRef, useCallback } from "react";
import { addToHistory } from "../utils/history";
import WaveformPlayer from "./WaveformPlayer";

const API_URL = "http://localhost:8000";

export default function AudioRecorder({ onHistoryUpdate }) {
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [saved, setSaved] = useState({});
  const mediaRecorder = useRef(null);
  const chunks = useRef([]);

  const startRecording = async () => {
    setResults(null);
    setError(null);
    setSaved({});
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder.current = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunks.current = [];

      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };

      mediaRecorder.current.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        sendAudio();
      };

      mediaRecorder.current.start();
      setRecording(true);
    } catch {
      setError("No se pudo acceder al micrófono. Verifica los permisos.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      mediaRecorder.current.stop();
      setRecording(false);
    }
  };

  const sendAudio = async () => {
    setLoading(true);
    const blob = new Blob(chunks.current, { type: "audio/webm" });
    setAudioUrl(URL.createObjectURL(blob));
    const formData = new FormData();
    formData.append("audio", blob, "recording.webm");

    try {
      const token = localStorage.getItem("oidoMusical_token");
      const res = await fetch(`${API_URL}/recognize`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      if (!res.ok) throw new Error("Error del servidor");
      const data = await res.json();
      setResults(data);
    } catch {
      setError("Error al enviar el audio. Verifica que el backend esté corriendo.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = useCallback(async (song, index) => {
    if (saved[index]) return;
    setSaved((prev) => ({ ...prev, [index]: true }));
    await addToHistory(song);
    onHistoryUpdate?.();
  }, [onHistoryUpdate, saved]);

  return (
    <div className="recorder">
      <div className="recorder-controls">
        {!recording ? (
          <button className="btn btn-record" onClick={startRecording} disabled={loading}>
            Tararear
          </button>
        ) : (
          <button className="btn btn-stop" onClick={stopRecording}>
            Detener
          </button>
        )}
      </div>

      {recording && <p className="status recording">Escuchando... tararea la canción</p>}

      {audioUrl && (
        <div className="playback">
          <p className="playback-label">Tu grabación:</p>
          <WaveformPlayer src={audioUrl} />
        </div>
      )}

      {loading && <p className="status loading">Analizando audio...</p>}
      {error && <p className="status error">{error}</p>}

      {results && (
        <div className="results">
          {results.found ? (
            <>
              <h2>Resultados</h2>
              <ul className="song-list">
                {results.songs.map((song, i) => (
                  <li key={i} className="song-item">
                    <span className="song-title">{song.title}</span>
                    <span className="song-artist">{song.artist}</span>
                    {song.album && <span className="song-album">{song.album}</span>}
                    <div className="song-actions">
                      <div className="song-links">
                        <a
                          href={song.spotifyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="song-link spotify-link"
                          title="Abrir en Spotify"
                          onClick={() => handleSave(song, i)}
                        >
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                          </svg>
                        </a>
                        <a
                          href={song.youtubeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="song-link youtube-link"
                          title="Abrir en YouTube"
                          onClick={() => handleSave(song, i)}
                        >
                          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                            <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                          </svg>
                        </a>
                      </div>
                      <button
                        className={`btn-save ${saved[i] ? "btn-saved" : ""}`}
                        onClick={() => handleSave(song, i)}
                        disabled={saved[i]}
                        title={saved[i] ? "Guardada" : "Guardar en historial"}
                      >
                        {saved[i] ? (
                          <>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                            </svg>
                            Guardada
                          </>
                        ) : (
                          <>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                            </svg>
                            Guardar
                          </>
                        )}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="status">No se encontraron coincidencias. Intenta de nuevo.</p>
          )}
        </div>
      )}
    </div>
  );
}
