"use client"

import { createSignal, onCleanup, onMount } from "solid-js"
import { getSongInfo } from "@/providers/song-info-front"
import "./style.css"
import volumeOff from "../../../assets/svgs/volume_off.svg"
import volumeDown from "../../../assets/svgs/volume_down.svg"
import volumeUp from "../../../assets/svgs/volume_up.svg"
import thumbUp from "../../../assets/svgs/thumb_up.svg"
import thumbDown from "../../../assets/svgs/thumb_down.svg"
import shuffle from "../../../assets/svgs/shuffle.svg"
import skipPrevious from "../../../assets/svgs/skip_previous.svg"
import playArrow from "../../../assets/svgs/play_arrow.svg"
import pause from "../../../assets/svgs/pause.svg"
import skipNext from "../../../assets/svgs/skip_next.svg"
import repeat from "../../../assets/svgs/repeat.svg"
import pictureInPicture from "../../../assets/svgs/picture_in_picture_medium.svg"
import fullscreen from "../../../assets/svgs/fullscreen.svg"
import expandSong from "../../../assets/svgs/expand_song.svg"

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val))
}

export default function YTMusicPlayer() {
  // Persistent storage keys
  const VOLUME_KEY = "ytmusic_custombar_volume"
  const MUTE_KEY = "ytmusic_custombar_muted"

  // Song info state
  const [song, setSong] = createSignal(getSongInfo())
  const [progress, setProgress] = createSignal(0)
  
  // Volume and mute state
  const [volume, setVolume] = createSignal(1)
  const [isMuted, setIsMuted] = createSignal(false)
  const [isSeeking, setIsSeeking] = createSignal(false)
  const [isLiked, setIsLiked] = createSignal(false)
  const [isDisliked, setIsDisliked] = createSignal(false)
  const [isShuffle, setIsShuffle] = createSignal(false)
  // CORRECTED STATE LOGIC: 0 = off, 1 = repeat all, 2 = repeat one. This matches YTM's internal logic.
  const [repeatMode, setRepeatMode] = createSignal(0)
  const [isPaused, setIsPaused] = createSignal(true)
  const [showDropdown, setShowDropdown] = createSignal(false)
  const [isExpanded, setIsExpanded] = createSignal(false)
  // Add a signal to track the current videoId
  const [currentVideoId, setCurrentVideoId] = createSignal<string | null>(null)

  // FIX: Add a flag to prevent UI updates during a "repeat one" cycle
  let isRepeatingOne = false

  // --- Volume sync logic ---
  let isUserVolumeChange = false
  const SYNC_DELAY = 300 // ms

  // Helper to request shuffle/repeat state
  function requestShuffle() {
    window.ipcRenderer.send("ytmd:get-shuffle")
  }
  function requestRepeat() {
    window.ipcRenderer.send("ytmd:get-repeat")
  }

  // Helper to detect DOM state directly (fallback)
  function detectShuffleState() {
    const shuffleBtn = document.querySelector('yt-icon-button.shuffle, button[aria-label*="Shuffle"]')
    if (shuffleBtn) {
      const isActive = shuffleBtn.classList.contains('style-primary-text') || 
                      shuffleBtn.getAttribute('aria-pressed') === 'true'
      setIsShuffle(isActive)
    }
  }

  // REWRITTEN: More reliable repeat state detection
  function detectRepeatState() {
    const repeatBtn = document.querySelector('yt-icon-button.repeat')
    if (repeatBtn) {
        const title = repeatBtn.getAttribute('title')?.toLowerCase() || ''
        let newMode = 0 // Default to off

        if (title === 'repeat all') {
            newMode = 1
        } else if (title === 'repeat one') {
            newMode = 2
        }

        if (newMode !== repeatMode()) {
            console.log(`[CustomBar] Repeat state changed: ${repeatMode()} -> ${newMode} (Title: "${title}")`)
            setRepeatMode(newMode)
        }
    }
  }

  // Stable handlers for shuffle/repeat state
  const handleShuffleChanged = (_: any, shuffleOn: boolean) => {
    setIsShuffle(!!shuffleOn)
  }

  // CORRECTED: This handler now uses the standardized state (0:off, 1:all, 2:one) and requires no conversion
  const handleRepeatChanged = (_: any, repeatModeValue: number) => {
    console.log('[CustomBar] Repeat changed via IPC:', repeatModeValue)
    setRepeatMode(repeatModeValue)
  }

  // Listen for song info updates
  onMount(() => {
    // --- Persistent volume/mute state ---
    let storedVolume = 1
    let storedMuted = false
    try {
      const v = localStorage.getItem(VOLUME_KEY)
      if (v !== null) storedVolume = clamp(Number(v), 0, 1)
      const m = localStorage.getItem(MUTE_KEY)
      if (m !== null) storedMuted = m === "true"
    } catch {}
    setVolume(storedVolume)
    setIsMuted(storedMuted)

    let lastVideo: HTMLVideoElement | null = null
    const applyCurrentStateToVideo = (video: HTMLVideoElement | null) => {
      if (!video || video === lastVideo) return
      video.volume = volume()
      video.muted = isMuted()
      lastVideo = video
    }
    
    applyCurrentStateToVideo(document.querySelector("video"))
    
    const videoObserver = new MutationObserver(() => {
      applyCurrentStateToVideo(document.querySelector("video"))
    })
    videoObserver.observe(document.body, { childList: true, subtree: true })

    // --- Song info updates ---
    // REWRITTEN: Handler to prevent UI desync on "Repeat One"
    const handler = (_: any, newSong: any) => {
        // If the repeat flag is active, ignore the update to prevent showing the next song's info
        if (isRepeatingOne) {
            console.log('[CustomBar] Ignoring song update due to "repeat one" cycle.')
            // We only reset the progress visually
            setProgress(newSong.elapsedSeconds || 0)
            return
        }

        setSong(newSong)
        setCurrentVideoId(newSong.videoId)
        // Always reset progress to the new song's elapsedSeconds (usually 0)
        setProgress(newSong.elapsedSeconds || 0)
    }
    window.ipcRenderer.on("ytmd:update-song-info", handler)

    // Paused state
    const getVideo = () => document.querySelector("video") as HTMLVideoElement | null
    const updatePaused = () => {
      const video = getVideo()
      if (video) setIsPaused(video.paused)
    }
    
    const video = getVideo()
    if (video) {
      video.addEventListener("pause", updatePaused)
      video.addEventListener("play", updatePaused)
      
      // FIX: Use the 'ended' event to flag that a repeat is happening
      video.addEventListener("ended", () => {
        // Mode 2 is "repeat one".
        if (repeatMode() === 2) {
            console.log('[CustomBar] Video ended on "repeat one". Flagging to prevent UI desync.')
            isRepeatingOne = true
            // Reset the flag after a short delay to allow the player to restart the track
            setTimeout(() => { isRepeatingOne = false }, 1500)
        }
        // After any song ends, re-check the repeat state, as YTM might auto-change it.
        setTimeout(detectRepeatState, 200)
      })
    }
    updatePaused()

    const onTimeUpdate = () => {
      const video = getVideo()
      // Only update progress if the videoId matches the current song
      if (video && !isSeeking() && currentVideoId() === song().videoId) {
        setProgress(video.currentTime)
      }
    }
    
    if (video) {
      video.addEventListener("timeupdate", onTimeUpdate)
    }

    // Fallback interval
    const interval = setInterval(() => {
      const video = getVideo()
      // Only update progress if the videoId matches the current song
      if (video && !isSeeking() && !video.paused && currentVideoId() === song().videoId) {
        setProgress(video.currentTime)
      }
      // Also, periodically check state for resilience
      detectShuffleState()
      detectRepeatState()
    }, 1000)

    // --- Sync shuffle/repeat state on mount ---
    setTimeout(() => {
        requestShuffle()
        requestRepeat()
        detectShuffleState()
        detectRepeatState()
    }, 1000)

    // Monitor for attribute changes on the repeat button for instant updates
    const setupRepeatButtonWatcher = () => {
      const repeatBtn = document.querySelector('yt-icon-button.repeat')
      if (repeatBtn) {
        const repeatObserver = new MutationObserver(detectRepeatState)
        repeatObserver.observe(repeatBtn, { attributes: true, attributeFilter: ['title'] })
        return () => repeatObserver.disconnect()
      }
      return () => {}
    }
    
    const cleanupRepeatWatcher = setupRepeatButtonWatcher()

    // Detect expanded mode
    const appLayout = document.querySelector('ytmusic-app-layout')
    let observer: MutationObserver | undefined
    if (appLayout) {
      const checkExpanded = () => {
        setIsExpanded(appLayout.getAttribute('player-ui-state') === 'PLAYER_PAGE_OPEN')
      }
      observer = new MutationObserver(checkExpanded)
      observer.observe(appLayout, { attributes: true, attributeFilter: ['player-ui-state'] })
      checkExpanded()
    }

    // Close dropdown when clicking outside
    const handleClickOutside = (e: MouseEvent) => {
      if (
        !(e.target as Element).closest(".ytmusic-dropdown") &&
        !(e.target as Element).closest("[data-dropdown-trigger]")
      ) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("click", handleClickOutside)

    const onVolumeChangeFromVideo = () => {
      const video = getVideo()
      if (!video || isUserVolumeChange) {
        isUserVolumeChange = false
        return
      }
      setVolume(video.volume)
      setIsMuted(video.muted)
    }
    if (video) {
      video.addEventListener("volumechange", onVolumeChangeFromVideo)
    }

    // Listen for shuffle/repeat state updates
    window.ipcRenderer.on("ytmd:shuffle-changed", handleShuffleChanged)
    window.ipcRenderer.on("ytmd:repeat-changed", handleRepeatChanged)

    onCleanup(() => {
      window.ipcRenderer.off("ytmd:update-song-info", handler)
      if (video) {
        video.removeEventListener("pause", updatePaused)
        video.removeEventListener("play", updatePaused)
        video.removeEventListener("timeupdate", onTimeUpdate)
        video.removeEventListener("ended", () => {})
        video.removeEventListener("volumechange", onVolumeChangeFromVideo)
      }
      clearInterval(interval)
      cleanupRepeatWatcher()
      window.ipcRenderer.off("ytmd:shuffle-changed", handleShuffleChanged)
      window.ipcRenderer.off("ytmd:repeat-changed", handleRepeatChanged)
      document.removeEventListener("click", handleClickOutside)
      videoObserver.disconnect()
      observer?.disconnect()
    })
  })

  // Controls
  const playPause = () => {
    const video = document.querySelector("video")
    if (!video) return
    if (video.paused) video.play()
    else video.pause()
  }

  const next = () => {
    (document.querySelector('.next-button') as HTMLElement)?.click()
  }
  
  const prev = () => {
    (document.querySelector('.previous-button') as HTMLElement)?.click()
  }

  const toggleLike = () => {
    setIsLiked(!isLiked())
    if (!isLiked()) setIsDisliked(false)
  }

  const toggleDislike = () => {
    setIsDisliked(!isDisliked())
    if (!isDisliked()) setIsLiked(false)
  }

  const toggleShuffle = () => {
    (document.querySelector('yt-icon-button.shuffle button') as HTMLElement)?.click()
    setTimeout(requestShuffle, SYNC_DELAY)
  }

  const toggleRepeat = () => {
    (document.querySelector('yt-icon-button.repeat button') as HTMLElement)?.click()
    setTimeout(requestRepeat, SYNC_DELAY)
  }

  const onSeek = (e: Event) => {
    const video = document.querySelector("video")
    if (!video) return
    const val = Number((e.target as HTMLInputElement).value)
    setProgress(val)
    video.currentTime = val
    setIsSeeking(false)
  }

  const onSeekStart = () => setIsSeeking(true)
  const onSeekEnd = (e: Event) => onSeek(e)

  const onVolumeChange = (e: Event) => {
    const video = document.querySelector("video")
    if (!video) return
    const val = clamp(Number((e.target as HTMLInputElement).value), 0, 1)
    setVolume(val)
    setIsMuted(false)
    isUserVolumeChange = true
    video.volume = val
    video.muted = false
    try {
      localStorage.setItem(VOLUME_KEY, String(val))
      localStorage.setItem(MUTE_KEY, "false")
    } catch {}
  }

  const toggleMute = () => {
    const video = document.querySelector("video")
    if (!video) return
    const newMuted = !video.muted
    setIsMuted(newMuted)
    isUserVolumeChange = true
    video.muted = newMuted
    try {
      localStorage.setItem(MUTE_KEY, String(newMuted))
    } catch {}
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  // Helper: check if the current song has a video available (not just if the video element is active)
  function hasVideoAvailable() {
    // Use the MediaType enum values from SongInfo
    const type = song().mediaType;
    return (
      type === 'ORIGINAL_MUSIC_VIDEO' ||
      type === 'USER_GENERATED_CONTENT' ||
      type === 'OTHER_VIDEO'
    );
  }

  // Helper: show the song image in PiP using a canvas hack
  async function showImageInPiP(imgSrc: string) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      alert('Canvas context not available.');
      return;
    }
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = imgSrc;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
    });
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0, img.width, img.height);
    // Add a message overlay to the canvas
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('Pause is supported in PiP, but resume must be done from the main app.', canvas.width / 2, canvas.height - 15);
    // Create a video from the canvas stream
    const stream = canvas.captureStream();
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.style.display = 'none';
    document.body.appendChild(video);
    await video.play();
    await new Promise<void>((resolve) => {
      if (video.readyState >= 2) resolve();
      else {
        const handler = () => {
          video.removeEventListener('canplay', handler);
          resolve();
        };
        video.addEventListener('canplay', handler);
      }
    });
    try {
      await video.requestPictureInPicture();
    } catch (err) {
      alert('Failed to open PiP for image.');
    }
    // Remove the video element when PiP closes
    video.addEventListener('leavepictureinpicture', () => {
      video.pause();
      video.srcObject = null;
      video.remove();
    });
  }

  // Toggle the YT Music miniplayer: open if closed, close if open
  const toggleMiniplayer = () => {
    // Miniplayer bar is present if miniplayer is open
    const miniplayerBar = document.querySelector('ytmusic-player-bar[miniplayer]');
    if (miniplayerBar) {
      // Try to find the close button by SVG path
      const closeBtn = Array.from(miniplayerBar.querySelectorAll('button')).find(btn => {
        const svg = btn.querySelector('svg');
        if (!svg) return false;
        // Check for the unique path data from the provided SVG
        return Array.from(svg.querySelectorAll('path')).some(path =>
          path.getAttribute('d') === 'M18 5H4v14h7v1H3V4h16v8h-1V5ZM6 7h5v1H7.707L12 12.293l-.707.707L7 8.707V12H6V7Zm7 7h9v8h-9v-8Z'
        );
      }) as HTMLElement | undefined;
      if (closeBtn) {
        closeBtn.click();
      } else {
        alert('Miniplayer close button not found.');
      }
    } else {
      // Miniplayer is closed, open it
      const miniplayerBtn = document.querySelector('.player-minimize-button') as HTMLElement | null;
      if (miniplayerBtn) {
        miniplayerBtn.click();
      } else {
        alert('Miniplayer button not found.');
      }
    }
  }

  const expandSongPage = () => {
    (document.querySelector('.toggle-player-page-button') as HTMLElement | null)?.click()
  }

  // Format time
  const fmt = (s: number) => {
    if (!isFinite(s)) return "0:00"
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
      .toString()
      .padStart(2, "0")
    return `${m}:${sec}`
  }

  const getVolumeIcon = () => {
    if (isMuted() || volume() === 0) {
      return volumeOff
    } else if (volume() < 0.5) {
      return volumeDown
    } else {
      return volumeUp
    }
  }

  return (
    <div
      class="ytmusic-bottom-bar"
      style={isExpanded() ? { zIndex: 999999 } as any : undefined}
    >
      {/* Left Section - Song Info */}
      <div class="ytmusic-left">
        <div class="ytmusic-album-cover">
          {song().imageSrc ? (
            <img src={(song().imageSrc as string) || "/placeholder.svg"} alt="Album cover" />
          ) : (
            <div class="ytmusic-no-cover">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                <path d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9zM9 17H7v-7h2zm4 0h-2V7h2zm4 0h-2v-4h2z" />
              </svg>
            </div>
          )}
        </div>

        <div class="ytmusic-song-info">
          <div
            class="ytmusic-title"
            title={song().title || "Song Title"}
          >
            {song().title || "Song Title"}
          </div>
          <div class="ytmusic-artist-album">
            <div
              class="ytmusic-artist ytmusic-link"
              title={song().artist || "Artist Name"}
              tabIndex={0}
              role="link"
              onClick={() => {
                // Try to find and click the actual artist link in the player bar
                const artistLink = document.querySelector('ytmusic-player-bar .subtitle a, ytmusic-player-bar .byline a[href*="browse"]');
                if (artistLink) {
                  (artistLink as HTMLElement).click();
                } else {
                  // Try to find artist link in the expanded player page
                  const playerPageArtistLink = document.querySelector('.content-info-wrapper a[href*="browse"]');
                  if (playerPageArtistLink) {
                    (playerPageArtistLink as HTMLElement).click();
                  } else {
                    // Try to get browseId and use app navigation
                    let browseId = null;
                    const artistAnchor = document.querySelector('ytmusic-player-bar .subtitle a, ytmusic-player-bar .byline a');
                    if (artistAnchor) {
                      const href = artistAnchor.getAttribute('href');
                      if (href && href.startsWith('/browse/')) {
                        browseId = href.replace('/browse/', '');
                      }
                    }
                    if (!browseId) {
                      const playerPageArtist = document.querySelector('.content-info-wrapper a[href^="/browse/"]');
                      if (playerPageArtist) {
                        const href = playerPageArtist.getAttribute('href');
                        if (href && href.startsWith('/browse/')) {
                          browseId = href.replace('/browse/', '');
                        }
                      }
                    }
                    
                    if (browseId) {
                      const app = document.querySelector('ytmusic-app');
                      if (app && typeof (app as any).navigate === 'function') {
                        (app as any).navigate(`/browse/${browseId}`);
                      } else {
                        const artistUrl = `https://music.youtube.com/browse/${browseId}`;
                        history.pushState({}, '', artistUrl);
                        window.dispatchEvent(new PopStateEvent('popstate'));
                      }
                    } else {
                      // Final fallback: search for the artist
                      const artist = song().artist || "";
                      if (artist) {
                        const app = document.querySelector('ytmusic-app');
                        if (app && typeof (app as any).navigate === 'function') {
                          (app as any).navigate(`/search?q=${encodeURIComponent(artist)}`);
                        } else {
                          const searchUrl = `https://music.youtube.com/search?q=${encodeURIComponent(artist)}`;
                          history.pushState({}, '', searchUrl);
                          window.dispatchEvent(new PopStateEvent('popstate'));
                        }
                      }
                    }
                  }
                }
              }}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                  const artistLink = document.querySelector('ytmusic-player-bar .subtitle a, ytmusic-player-bar .byline a[href*="browse"]');
                  if (artistLink) {
                    (artistLink as HTMLElement).click();
                  } else {
                    const playerPageArtistLink = document.querySelector('.content-info-wrapper a[href*="browse"]');
                    if (playerPageArtistLink) {
                      (playerPageArtistLink as HTMLElement).click();
                    } else {
                      let browseId = null;
                      const artistAnchor = document.querySelector('ytmusic-player-bar .subtitle a, ytmusic-player-bar .byline a');
                      if (artistAnchor) {
                        const href = artistAnchor.getAttribute('href');
                        if (href && href.startsWith('/browse/')) {
                          browseId = href.replace('/browse/', '');
                        }
                      }
                      if (!browseId) {
                        const playerPageArtist = document.querySelector('.content-info-wrapper a[href^="/browse/"]');
                        if (playerPageArtist) {
                          const href = playerPageArtist.getAttribute('href');
                          if (href && href.startsWith('/browse/')) {
                            browseId = href.replace('/browse/', '');
                          }
                        }
                      }
                      
                      if (browseId) {
                        const app = document.querySelector('ytmusic-app');
                        if (app && typeof (app as any).navigate === 'function') {
                          (app as any).navigate(`/browse/${browseId}`);
                        } else {
                          const artistUrl = `https://music.youtube.com/browse/${browseId}`;
                          history.pushState({}, '', artistUrl);
                          window.dispatchEvent(new PopStateEvent('popstate'));
                        }
                      } else {
                        const artist = song().artist || "";
                        if (artist) {
                          const app = document.querySelector('ytmusic-app');
                          if (app && typeof (app as any).navigate === 'function') {
                            (app as any).navigate(`/search?q=${encodeURIComponent(artist)}`);
                          } else {
                            const searchUrl = `https://music.youtube.com/search?q=${encodeURIComponent(artist)}`;
                            history.pushState({}, '', searchUrl);
                            window.dispatchEvent(new PopStateEvent('popstate'));
                          }
                        }
                      }
                    }
                  }
                }
              }}
            >
              {song().artist || "Artist Name"}
            </div>
            {song().album && (
              <div class="ytmusic-album-section">
                <span class="ytmusic-separator"> • </span>
                <div
                  class="ytmusic-album ytmusic-link"
                  title={song().album || ""}
                  tabIndex={0}
                  role="link"
                  onClick={() => {
                    // Try to find and click the actual album link in the player bar or expanded player page
                    // Use more specific selectors to find album links
                    const albumLink = document.querySelector('ytmusic-player-bar a[href*="browse"][title*="album"], .content-info-wrapper a[href*="browse"][title*="album"], ytmusic-player-bar a[href*="browse"][aria-label*="album"], .content-info-wrapper a[href*="browse"][aria-label*="album"]');
                    if (albumLink) {
                      (albumLink as HTMLElement).click();
                    } else {
                      // Try to find album link in the expanded player page with different selectors
                      const playerPageAlbumLink = document.querySelector('.content-info-wrapper a[href*="browse"]:not([title*="artist"]):not([aria-label*="artist"])');
                      if (playerPageAlbumLink) {
                        (playerPageAlbumLink as HTMLElement).click();
                      } else {
                        // Try to get browseId and use app navigation
                        let browseId = null;
                        // Try to find album browseId from the DOM
                        const albumAnchor = document.querySelector('ytmusic-player-bar a[href*="browse"]:not([title*="artist"]):not([aria-label*="artist"]), .content-info-wrapper a[href*="browse"]:not([title*="artist"]):not([aria-label*="artist"])');
                        if (albumAnchor) {
                          const href = albumAnchor.getAttribute('href');
                          if (href && href.startsWith('/browse/')) {
                            browseId = href.replace('/browse/', '');
                          }
                        }
                        
                        if (browseId) {
                          const app = document.querySelector('ytmusic-app');
                          if (app && typeof (app as any).navigate === 'function') {
                            (app as any).navigate(`/browse/${browseId}`);
                          } else {
                            const albumUrl = `https://music.youtube.com/browse/${browseId}`;
                            history.pushState({}, '', albumUrl);
                            window.dispatchEvent(new PopStateEvent('popstate'));
                          }
                        } else {
                          // Final fallback: search for the album
                          const album = song().album || "";
                          if (album) {
                            const app = document.querySelector('ytmusic-app');
                            if (app && typeof (app as any).navigate === 'function') {
                              (app as any).navigate(`/search?q=${encodeURIComponent(album)}`);
                            } else {
                              const searchUrl = `https://music.youtube.com/search?q=${encodeURIComponent(album)}`;
                              history.pushState({}, '', searchUrl);
                              window.dispatchEvent(new PopStateEvent('popstate'));
                            }
                          }
                        }
                      }
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                      const albumLink = document.querySelector('ytmusic-player-bar a[href*="browse"][title*="album"], .content-info-wrapper a[href*="browse"][title*="album"], ytmusic-player-bar a[href*="browse"][aria-label*="album"], .content-info-wrapper a[href*="browse"][aria-label*="album"]');
                      if (albumLink) {
                        (albumLink as HTMLElement).click();
                      } else {
                        const playerPageAlbumLink = document.querySelector('.content-info-wrapper a[href*="browse"]:not([title*="artist"]):not([aria-label*="artist"])');
                        if (playerPageAlbumLink) {
                          (playerPageAlbumLink as HTMLElement).click();
                        } else {
                          let browseId = null;
                          const albumAnchor = document.querySelector('ytmusic-player-bar a[href*="browse"]:not([title*="artist"]):not([aria-label*="artist"]), .content-info-wrapper a[href*="browse"]:not([title*="artist"]):not([aria-label*="artist"])');
                          if (albumAnchor) {
                            const href = albumAnchor.getAttribute('href');
                            if (href && href.startsWith('/browse/')) {
                              browseId = href.replace('/browse/', '');
                            }
                          }
                          
                          if (browseId) {
                            const app = document.querySelector('ytmusic-app');
                            if (app && typeof (app as any).navigate === 'function') {
                              (app as any).navigate(`/browse/${browseId}`);
                            } else {
                              const albumUrl = `https://music.youtube.com/browse/${browseId}`;
                              history.pushState({}, '', albumUrl);
                              window.dispatchEvent(new PopStateEvent('popstate'));
                            }
                          } else {
                            const album = song().album || "";
                            if (album) {
                              const app = document.querySelector('ytmusic-app');
                              if (app && typeof (app as any).navigate === 'function') {
                                (app as any).navigate(`/search?q=${encodeURIComponent(album)}`);
                              } else {
                                const searchUrl = `https://music.youtube.com/search?q=${encodeURIComponent(album)}`;
                                history.pushState({}, '', searchUrl);
                                window.dispatchEvent(new PopStateEvent('popstate'));
                              }
                            }
                          }
                        }
                      }
                    }
                  }}
                >
                  {song().album}
                </div>
              </div>
            )}
          </div>
        </div>

        <div class="ytmusic-like-section">
          <button class={`ytmusic-like-btn ${isLiked() ? "liked" : ""}`} onClick={toggleLike} title="Like">
            <img src={thumbUp} alt="Like" />
          </button>
          <button class={`ytmusic-like-btn ${isDisliked() ? "disliked" : ""}`} onClick={toggleDislike} title="Dislike">
            <img src={thumbDown} alt="Dislike" />
          </button>
        </div>
      </div>

      {/* Center Section - Controls & Progress */}
      <div class="ytmusic-center">
        <div class="ytmusic-controls">
          <button class={`ytmusic-control-btn ${isShuffle() ? "active" : ""}`} onClick={toggleShuffle} title="Shuffle">
            <img src={shuffle} alt="Shuffle" />
          </button>

          <button class="ytmusic-nav-btn" onClick={prev} title="Previous">
            <img src={skipPrevious} alt="Previous" />
          </button>

          <button class="ytmusic-play-btn" onClick={playPause} title={isPaused() ? "Play" : "Pause"}>
            <img src={isPaused() ? playArrow : pause} alt={isPaused() ? "Play" : "Pause"} />
          </button>

          <button class="ytmusic-nav-btn" onClick={next} title="Next">
            <img src={skipNext} alt="Next" />
          </button>

          {/* CORRECTED: Visual logic for repeat button */}
          <button
            class={`ytmusic-control-btn ${repeatMode() > 0 ? "active" : ""}`}
            onClick={toggleRepeat}
            title={`Repeat ${repeatMode() === 0 ? 'off' : repeatMode() === 1 ? 'all' : 'one'}`}
            style={{ position: 'relative' }}
          >
            <img src={repeat} alt="Repeat" />
            {/* The dot now correctly shows for "repeat one" (mode 2) */}
            {repeatMode() === 2 && (
              <span class="ytmusic-repeat-dot" />
            )}
          </button>
        </div>

        <div class="ytmusic-progress">
          <span class="ytmusic-time">{fmt(progress())}</span>
          <div class="ytmusic-progress-bar">
            <input
              type="range"
              min={0}
              max={song().songDuration || 1}
              value={progress()}
              onInput={onSeek}
              onMouseDown={onSeekStart}
              onMouseUp={onSeekEnd}
              class="ytmusic-slider"
              style={{
                "--progress": `${Math.min((progress() / (song().songDuration || 1)) * 100, 100)}%`,
              }}
            />
          </div>
          <span class="ytmusic-time">{fmt(song().songDuration || 0)}</span>
        </div>
      </div>

      {/* Right Section - Volume & Additional Controls */}
      <div class="ytmusic-right">
        <div class="ytmusic-volume">
          <button class="ytmusic-volume-btn" onClick={toggleMute} title="Mute">
            <img src={getVolumeIcon()} alt="Volume" />
          </button>
          <div class="ytmusic-volume-bar">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={isMuted() ? 0 : volume()}
              onInput={onVolumeChange}
              class="ytmusic-volume-slider"
              style={{
                "--volume": `${(isMuted() ? 0 : volume()) * 100}%`,
              }}
            />
          </div>
        </div>

        <div class="ytmusic-additional-controls">
          <button class="ytmusic-menu-btn" title="Queue">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
            </svg>
          </button>
          <button class="ytmusic-menu-btn" onClick={toggleMiniplayer} title="Toggle Miniplayer">
            <img src={pictureInPicture} alt="Miniplayer" />
          </button>
          <button class="ytmusic-menu-btn" onClick={expandSongPage} title="Expand Song">
            <img src={expandSong} alt="Expand Song" />
          </button>
          <button class="ytmusic-menu-btn" onClick={toggleFullscreen} title="Fullscreen">
            <img src={fullscreen} alt="Fullscreen" />
          </button>
        </div>
      </div>
    </div>
  )
}