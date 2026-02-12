import { getHistory, clearHistory } from "../utils/history";

export default function SearchHistory({ refreshKey, onClear }) {
  const history = getHistory();

  if (history.length === 0) return null;

  const handleClear = () => {
    clearHistory();
    onClear?.();
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="history">
      <div className="history-header">
        <h2>Historial</h2>
        <button className="btn-clear" onClick={handleClear}>
          Limpiar historial
        </button>
      </div>
      <ul className="song-list">
        {history.map((entry) => (
          <li key={entry.id} className="song-item">
            <span className="song-title">{entry.title}</span>
            <span className="song-artist">{entry.artist}</span>
            {entry.album && <span className="song-album">{entry.album}</span>}
            <div className="song-links">
              <a
                href={entry.spotifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="song-link spotify-link"
              >
                Spotify
              </a>
              <a
                href={entry.youtubeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="song-link youtube-link"
              >
                YouTube
              </a>
            </div>
            <span className="song-date">{formatDate(entry.timestamp)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
