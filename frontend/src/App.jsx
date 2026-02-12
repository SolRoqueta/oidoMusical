import { useState, useCallback } from "react";
import AudioRecorder from "./components/AudioRecorder";
import SearchHistory from "./components/SearchHistory";
import "./App.css";

function App() {
  const [historyVersion, setHistoryVersion] = useState(0);

  const handleHistoryUpdate = useCallback(() => {
    setHistoryVersion((v) => v + 1);
  }, []);

  return (
    <div className="app">
      <h1>OidoMusical</h1>
      <p className="subtitle">Tararea una canción y descubre su nombre</p>
      <AudioRecorder onHistoryUpdate={handleHistoryUpdate} />
      <SearchHistory refreshKey={historyVersion} onClear={handleHistoryUpdate} />
    </div>
  );
}

export default App;
