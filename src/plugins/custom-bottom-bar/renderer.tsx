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
  const [isLiked, setIsLiked] = createSignal(false);
  const [isShuffle, setIsShuffle] = createSignal(false);
  const [repeatMode, setRepeatMode] = createSignal(0); // 0: off, 1: all, 2: one

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
  
  const toggleLike = () => setIsLiked(!isLiked());
  const toggleShuffle = () => setIsShuffle(!isShuffle());
  const toggleRepeat = () => setRepeatMode((repeatMode() + 1) % 3);
  
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
  
  const onVolumeChange = (e: Event) => {
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

  const getRepeatIcon = () => {
    switch (repeatMode()) {
      case 1: return '🔁';
      case 2: return '🔂';
      default: return '🔁';
    }
  };

  return (
    <div class="spotify-bottom-bar">
      {/* Left Section - Song Info */}
      <div class="spotify-left">
        <div class="spotify-album-cover">
          {song().imageSrc ? (
            <img src={song().imageSrc as string} alt="Album cover" />
          ) : (
            <div class="spotify-no-cover">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9zM9 17H7v-7h2zm4 0h-2V7h2zm4 0h-2v-4h2z"/>
              </svg>
            </div>
          )}
        </div>
        <div class="spotify-song-info">
          <div class="spotify-title">{song().title || 'Song Title'}</div>
          <div class="spotify-artist">{song().artist || 'Artist Name'}</div>
        </div>
        <button 
          class={`spotify-like-btn ${isLiked() ? 'liked' : ''}`}
          onClick={toggleLike}
          title="Add to Liked Songs"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314z"/>
          </svg>
        </button>
      </div>

      {/* Center Section - Controls & Progress */}
      <div class="spotify-center">
        <div class="spotify-controls">
          <button 
            class={`spotify-control-btn ${isShuffle() ? 'active' : ''}`}
            onClick={toggleShuffle}
            title="Enable shuffle"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.151.922a.75.75 0 1 0-1.06 1.06L13.109 3H11.16a3.75 3.75 0 0 0-2.873 1.34l-6.173 7.356A2.25 2.25 0 0 1 .39 12.5H0V14h.391a3.75 3.75 0 0 0 2.873-1.34l6.173-7.356a2.25 2.25 0 0 1 1.724-.804h1.947l-1.017 1.018a.75.75 0 0 0 1.06 1.06L15.98 3.75 13.151.922zM.391 3.5H0V2h.391c1.109 0 2.16.49 2.873 1.34L4.89 5.277l-.979 1.167-1.796-2.14A2.25 2.25 0 0 0 .391 3.5z"/>
              <path d="m7.5 10.723.98-1.167.957 1.14a2.25 2.25 0 0 0 1.724.804h1.947l-1.017-1.018a.75.75 0 1 1 1.06-1.06l2.829 2.828-2.829 2.828a.75.75 0 1 1-1.06-1.06L13.109 13H11.16a3.75 3.75 0 0 1-2.873-1.34l-.787-.938z"/>
            </svg>
          </button>
          
          <button class="spotify-control-btn" onClick={prev} title="Previous">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.3 1a.7.7 0 0 1 .7.7v5.15l9.95-5.744a.7.7 0 0 1 1.05.606v12.588a.7.7 0 0 1-1.05.606L4 8.149V13.3a.7.7 0 0 1-.7.7H1.7a.7.7 0 0 1-.7-.7V1.7a.7.7 0 0 1 .7-.7h1.6z"/>
            </svg>
          </button>
          
          <button class="spotify-play-btn" onClick={playPause} title="Play/Pause">
            {song().isPaused ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="m2.7 1.3-.7.7v12l.7.7h2.6l.7-.7V2l-.7-.7H2.7zm8 0-.7.7v12l.7.7h2.6l.7-.7V2l-.7-.7h-2.6z"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.287V1.713z"/>
              </svg>
            )}
          </button>
          
          <button class="spotify-control-btn" onClick={next} title="Next">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M12.7 1a.7.7 0 0 0-.7.7v5.15L2.05 1.107A.7.7 0 0 0 1 1.712v12.588a.7.7 0 0 0 1.05.606L12 8.149V13.3a.7.7 0 0 0 .7.7h1.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7h-1.6z"/>
            </svg>
          </button>
          
          <button 
            class={`spotify-control-btn ${repeatMode() > 0 ? 'active' : ''}`}
            onClick={toggleRepeat}
            title="Enable repeat"
          >
            {repeatMode() === 2 ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M0 4.75A3.75 3.75 0 0 1 3.75 1h8.5A3.75 3.75 0 0 1 16 4.75v5a3.75 3.75 0 0 1-3.75 3.75H9.81l1.018 1.018a.75.75 0 1 1-1.06 1.06L6.939 12.75l2.829-2.828a.75.75 0 1 1 1.06 1.06L9.811 12h2.439a2.25 2.25 0 0 0 2.25-2.25v-5a2.25 2.25 0 0 0-2.25-2.25h-8.5A2.25 2.25 0 0 0 1.5 4.75v5A2.25 2.25 0 0 0 3.75 12H5v1.5H3.75A3.75 3.75 0 0 1 0 9.75v-5z"/>
                <path d="M7 8.5a1.5 1.5 0 1 1 3 0V10h-1V8.5a.5.5 0 1 0-1 0V10H7V8.5z"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M0 4.75A3.75 3.75 0 0 1 3.75 1h8.5A3.75 3.75 0 0 1 16 4.75v5a3.75 3.75 0 0 1-3.75 3.75H9.81l1.018 1.018a.75.75 0 1 1-1.06 1.06L6.939 12.75l2.829-2.828a.75.75 0 1 1 1.06 1.06L9.811 12h2.439a2.25 2.25 0 0 0 2.25-2.25v-5a2.25 2.25 0 0 0-2.25-2.25h-8.5A2.25 2.25 0 0 0 1.5 4.75v5A2.25 2.25 0 0 0 3.75 12H5v1.5H3.75A3.75 3.75 0 0 1 0 9.75v-5z"/>
              </svg>
            )}
          </button>
        </div>
        
        <div class="spotify-progress">
          <span class="spotify-time">{fmt(progress())}</span>
          <div class="spotify-progress-bar">
            <input
              type="range"
              min={0}
              max={song().songDuration || 1}
              value={progress()}
              onInput={onSeek}
              onMouseDown={onSeekStart}
              onMouseUp={onSeekEnd}
              class="spotify-slider"
            />
          </div>
          <span class="spotify-time">{fmt(song().songDuration || 0)}</span>
        </div>
      </div>

      {/* Right Section - Volume & Additional Controls */}
      <div class="spotify-right">
        <button class="spotify-control-btn" title="Now Playing View">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.426 2.574a2.831 2.831 0 0 0-4.797 1.55l3.247 3.247a2.831 2.831 0 0 0 1.55-4.797zM10.5 8.118l-2.619-2.62A63303.13 63303.13 0 0 0 4.74 9.075L2.065 12.12a1.287 1.287 0 0 0 1.816 1.816l3.064-2.688 3.553-3.129z"/>
          </svg>
        </button>
        
        <button class="spotify-control-btn" title="Queue">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M15 15H1v-1.5h14V15zm0-4.5H1V9h14v1.5zm-14-7A2.5 2.5 0 0 1 3.5 1h9A2.5 2.5 0 0 1 15 3.5v1A2.5 2.5 0 0 1 12.5 7h-9A2.5 2.5 0 0 1 1 4.5v-1zm2.5-.5a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1h-9z"/>
          </svg>
        </button>
        
        <button class="spotify-control-btn" title="Connect to a device">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 2.75C6 1.784 6.784 1 7.75 1h6.5c.966 0 1.75.784 1.75 1.75v6.5A1.75 1.75 0 0 1 14.25 11H7.75A1.75 1.75 0 0 1 6 9.25v-6.5zm1.75-.25a.25.25 0 0 0-.25.25v6.5c0 .138.112.25.25.25h6.5a.25.25 0 0 0 .25-.25v-6.5a.25.25 0 0 0-.25-.25h-6.5zm-6 1.5C1.75 2.784.966 3.568.966 4.534L1 10.25A1.75 1.75 0 0 0 2.75 12h6.5c.966 0 1.75-.784 1.75-1.75V4.75H9.5v5.5c0 .138-.112.25-.25.25h-6.5A.25.25 0 0 1 2.5 10V4.75h-.75z"/>
          </svg>
        </button>
        
        <div class="spotify-volume">
          <button class="spotify-control-btn" title="Mute">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              {volume() === 0 ? (
                <path d="M13.86 5.47a.75.75 0 0 0-1.061 0l-1.47 1.47-1.47-1.47A.75.75 0 0 0 8.8 6.53L10.269 8l-1.47 1.47a.75.75 0 1 0 1.06 1.061l1.47-1.47 1.47 1.47a.75.75 0 0 0 1.061-1.061L12.39 8l1.47-1.47a.75.75 0 0 0 0-1.06z"/>
              ) : volume() < 0.5 ? (
                <path d="M9.741.85a.8.8 0 0 1 .375.65v13a.8.8 0 0 1-1.125.73L6.741 14H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h4.741L9.116.12a.8.8 0 0 1 .625.73z"/>
              ) : (
                <>
                  <path d="M11.536 14.01A8.473 8.473 0 0 0 14.026 8a8.473 8.473 0 0 0-2.49-6.01l-.708.707A7.476 7.476 0 0 1 13.025 8c0 2.071-.84 3.946-2.197 5.303l.708.707z"/>
                  <path d="M10.121 12.596A6.48 6.48 0 0 0 12.025 8a6.48 6.48 0 0 0-1.904-4.596l-.707.707A5.48 5.48 0 0 1 11.025 8a5.48 5.48 0 0 1-1.61 3.89l.706.706z"/>
                  <path d="M8.707 11.182A4.486 4.486 0 0 0 10.025 8a4.486 4.486 0 0 0-1.318-3.182L8 5.525A3.489 3.489 0 0 1 9.025 8 3.49 3.49 0 0 1 8 10.475l.707.707zM6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06z"/>
                </>
              )}
            </svg>
          </button>
          <div class="spotify-volume-bar">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume()}
              onInput={onVolumeChange}
              class="spotify-volume-slider"
            />
          </div>
        </div>
        
        <button class="spotify-control-btn" title="Show Mini Player">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M16 2.45c0-.8-.65-1.45-1.45-1.45H1.45C.65 1 0 1.65 0 2.45v11.1C0 14.35.65 15 1.45 15h5.557v-1.5H1.5v-11h13v11H9.493V15h5.052c.8 0 1.455-.65 1.455-1.45V2.45z"/>
            <path d="M7.25 10.25H5.5V8.5h1.75V6.75h1.5V8.5H10v1.75H8.75v1.75h-1.5v-1.75z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}