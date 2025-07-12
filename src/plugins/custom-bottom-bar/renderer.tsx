import { createSignal, onCleanup, onMount } from 'solid-js';
import { getSongInfo } from '@/providers/song-info-front';
import './style.css';

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

export default function CustomBottomBar() {
  // Song info state
  const [song, setSong] = createSignal(getSongInfo());
  const [progress, setProgress] = createSignal(song().elapsedSeconds || 0);
  const [volume, setVolume] = createSignal(1);
  const [isSeeking, setIsSeeking] = createSignal(false);

  // Listen for song info updates
  onMount(() => {
    const handler = (_: any, newSong: any) => {
      setSong(newSong);
      if (!isSeeking()) setProgress(newSong.elapsedSeconds || 0);
    };
    window.ipcRenderer.on('ytmd:update-song-info', handler);
    // Volume
    const video = document.querySelector('video');
    if (video) setVolume(video.volume);
    const onVolume = () => setVolume(video!.volume);
    video?.addEventListener('volumechange', onVolume);
    // Progress
    let interval: any = setInterval(() => {
      if (!isSeeking() && !song().isPaused) {
        setProgress((p) => clamp((p || 0) + 1, 0, song().songDuration || 0));
      }
    }, 1000);
    onCleanup(() => {
      window.ipcRenderer.off('ytmd:update-song-info', handler);
      video?.removeEventListener('volumechange', onVolume);
      clearInterval(interval);
    });
  });

  // Controls
  const playPause = () => {
    const video = document.querySelector('video');
    if (!video) return;
    if (video.paused) video.play();
    else video.pause();
  };
  const next = () => document.querySelector('video')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
  const prev = () => document.querySelector('video')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
  const onSeek = (e: Event) => {
    const video = document.querySelector('video');
    if (!video) return;
    const val = Number((e.target as HTMLInputElement).value);
    setProgress(val);
    video.currentTime = val;
    setIsSeeking(false);
  };
  const onSeekStart = () => setIsSeeking(true);
  const onSeekEnd = (e: Event) => onSeek(e);
  const onVolume = (e: Event) => {
    const video = document.querySelector('video');
    if (!video) return;
    const val = Number((e.target as HTMLInputElement).value);
    setVolume(val);
    video.volume = val;
  };

  // Format time
  const fmt = (s: number) => {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  return (
    <div class="custom-bottom-bar">
      {/* Album cover */}
      <div class="cbb-album-cover">
        {song().imageSrc ? <img src={song().imageSrc as string} alt="cover" style={{ width: '100%', height: '100%', 'object-fit': 'cover' }} /> : '[Album]'}
      </div>
      {/* Song info */}
      <div class="cbb-song-info">
        <div class="cbb-title">{song().title || 'Song Title'}</div>
        <div class="cbb-artist">{song().artist || 'Artist Name'}</div>
      </div>
      {/* Progress bar */}
      <div class="cbb-progress">
        <span>{fmt(progress())}</span>
        <input
          type="range"
          min={0}
          max={song().songDuration || 1}
          value={progress()}
          onInput={onSeek}
          onMouseDown={onSeekStart}
          onMouseUp={onSeekEnd}
          style={{ flex: 1, 'margin': '0 8px' }}
        />
        <span>{fmt(song().songDuration || 0)}</span>
      </div>
      {/* Controls */}
      <div class="cbb-controls">
        <button onClick={prev} title="Previous">⏮</button>
        <button onClick={playPause} title="Play/Pause">{song().isPaused ? '▶️' : '⏸'}</button>
        <button onClick={next} title="Next">⏭</button>
      </div>
      {/* Volume */}
      <div class="cbb-volume">
        <span>🔊</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume()}
          onInput={onVolume}
          style={{ 'margin-left': '8px', width: '80px' }}
        />
      </div>
    </div>
  );
} 