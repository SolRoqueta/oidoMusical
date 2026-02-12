import { useState, useRef, useEffect, useCallback } from "react";

const BAR_COUNT = 40;

function extractWaveform(audioBuffer, bars) {
  const rawData = audioBuffer.getChannelData(0);
  const samplesPerBar = Math.floor(rawData.length / bars);
  const waveform = [];
  for (let i = 0; i < bars; i++) {
    let sum = 0;
    const start = i * samplesPerBar;
    for (let j = start; j < start + samplesPerBar; j++) {
      sum += Math.abs(rawData[j]);
    }
    waveform.push(sum / samplesPerBar);
  }
  const max = Math.max(...waveform) || 1;
  return waveform.map((v) => Math.max(0.08, v / max));
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function WaveformPlayer({ src }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [waveform, setWaveform] = useState(null);
  const audioRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => {
      setDuration(audio.duration);
    });
    audio.addEventListener("ended", () => {
      setPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    });

    // Decode audio to extract waveform
    fetch(src)
      .then((res) => res.arrayBuffer())
      .then((buf) => {
        const ctx = new AudioContext();
        return ctx.decodeAudioData(buf).finally(() => ctx.close());
      })
      .then((decoded) => {
        setWaveform(extractWaveform(decoded, BAR_COUNT));
        if (!duration) setDuration(decoded.duration);
      })
      .catch(() => {
        // Fallback: generate random-looking bars
        setWaveform(Array.from({ length: BAR_COUNT }, () => 0.1 + Math.random() * 0.9));
      });

    return () => {
      audio.pause();
      cancelAnimationFrame(animRef.current);
    };
  }, [src]);

  const tick = useCallback(() => {
    const audio = audioRef.current;
    if (audio && !audio.paused) {
      const p = audio.currentTime / (audio.duration || 1);
      setProgress(p);
      setCurrentTime(audio.currentTime);
      animRef.current = requestAnimationFrame(tick);
    }
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      cancelAnimationFrame(animRef.current);
    } else {
      audio.play();
      animRef.current = requestAnimationFrame(tick);
    }
    setPlaying(!playing);
  };

  const handleBarClick = (e) => {
    const audio = audioRef.current;
    if (!audio) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    audio.currentTime = x * audio.duration;
    setProgress(x);
    setCurrentTime(audio.currentTime);
  };

  return (
    <div className="waveform-player">
      <button className="wf-play-btn" onClick={togglePlay}>
        {playing ? (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
            <path d="M8 5.14v13.72a1 1 0 001.5.86l11-6.86a1 1 0 000-1.72l-11-6.86A1 1 0 008 5.14z" />
          </svg>
        )}
      </button>

      <div className="wf-body">
        <div className="wf-bars" onClick={handleBarClick}>
          {waveform
            ? waveform.map((h, i) => {
                const played = i / BAR_COUNT < progress;
                return (
                  <div
                    key={i}
                    className={`wf-bar ${played ? "wf-bar-played" : ""}`}
                    style={{ height: `${h * 100}%` }}
                  />
                );
              })
            : Array.from({ length: BAR_COUNT }, (_, i) => (
                <div key={i} className="wf-bar wf-bar-loading" style={{ height: "20%" }} />
              ))}
        </div>
        <span className="wf-time">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}
