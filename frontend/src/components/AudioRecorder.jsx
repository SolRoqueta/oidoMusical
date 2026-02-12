import { useState, useRef } from "react";
import { addToHistory } from "../utils/history";
import WaveformPlayer from "./WaveformPlayer";

const API_URL = "http://localhost:8000";

export default function AudioRecorder({ onHistoryUpdate }) {
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const mediaRecorder = useRef(null);
  const chunks = useRef([]);

  const startRecording = async () => {
    setResults(null);
    setError(null);
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
      const res = await fetch(`${API_URL}/recognize`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Error del servidor");
      const data = await res.json();
      setResults(data);
      if (data.found && data.songs.length > 0) {
        data.songs.forEach((song) => addToHistory(song));
        onHistoryUpdate?.();
      }
    } catch {
      setError("Error al enviar el audio. Verifica que el backend esté corriendo.");
    } finally {
      setLoading(false);
    }
  };

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
                    <div className="song-links">
                      <a
                        href={song.spotifyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="song-link spotify-link"
                      >
                        Spotify
                      </a>
                      <a
                        href={song.youtubeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="song-link youtube-link"
                      >
                        YouTube
                      </a>
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
