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
  // Song info state
  const [song, setSong] = createSignal(getSongInfo())
  const [progress, setProgress] = createSignal(song().elapsedSeconds || 0)
  const [volume, setVolume] = createSignal(1)
  const [isSeeking, setIsSeeking] = createSignal(false)
  const [isLiked, setIsLiked] = createSignal(false)
  const [isDisliked, setIsDisliked] = createSignal(false)
  const [isShuffle, setIsShuffle] = createSignal(false)
  const [repeatMode, setRepeatMode] = createSignal(0) // 0: off, 1: all, 2: one
  const [isPaused, setIsPaused] = createSignal(true)
  const [showDropdown, setShowDropdown] = createSignal(false)

  // Stable handlers for shuffle/repeat state
  const handleShuffleChanged = (_: any, shuffleOn: boolean) => {
    setIsShuffle(!!shuffleOn)
  }
  const handleShuffleResponse = (_: any, shuffleOn: boolean) => {
    setIsShuffle(!!shuffleOn)
  }
  const handleRepeatChanged = (_: any, repeatModeValue: number) => {
    setRepeatMode(repeatModeValue)
  }

  // Listen for song info updates
  onMount(() => {
    const handler = (_: any, newSong: any) => {
      setSong(newSong)
      if (!isSeeking()) setProgress(newSong.elapsedSeconds || 0)
    }
    window.ipcRenderer.on("ytmd:update-song-info", handler)

    // Volume
    const video = document.querySelector("video")
    if (video) setVolume(video.volume)
    const onVolume = () => setVolume(video!.volume)
    video?.addEventListener("volumechange", onVolume)

    // Paused state
    const updatePaused = () => setIsPaused(video!.paused)
    video?.addEventListener("pause", updatePaused)
    video?.addEventListener("play", updatePaused)
    updatePaused()

    // Progress (use timeupdate for accuracy)
    const onTimeUpdate = () => {
      if (!isSeeking()) setProgress(video!.currentTime)
    }
    video?.addEventListener("timeupdate", onTimeUpdate)

    // Fallback interval (only if playing)
    const interval: any = setInterval(() => {
      if (!isSeeking() && video && !video.paused && !video.ended) {
        setProgress(video.currentTime)
      }
    }, 1000)

    // Listen for shuffle/repeat state updates from main process
    window.ipcRenderer.on("ytmd:shuffle-changed", handleShuffleChanged)
    window.ipcRenderer.on("ytmd:get-shuffle-response", handleShuffleResponse)
    window.ipcRenderer.on("ytmd:repeat-changed", handleRepeatChanged)

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

    onCleanup(() => {
      window.ipcRenderer.off("ytmd:update-song-info", handler)
      video?.removeEventListener("volumechange", onVolume)
      video?.removeEventListener("pause", updatePaused)
      video?.removeEventListener("play", updatePaused)
      video?.removeEventListener("timeupdate", onTimeUpdate)
      clearInterval(interval)
      window.ipcRenderer.off("ytmd:shuffle-changed", handleShuffleChanged)
      window.ipcRenderer.off("ytmd:get-shuffle-response", handleShuffleResponse)
      window.ipcRenderer.off("ytmd:repeat-changed", handleRepeatChanged)
      document.removeEventListener("click", handleClickOutside)
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
    ;(
      document.querySelector('.next-button.ytmusic-player-bar, tp-yt-paper-icon-button[title="Next"]') as HTMLElement
    )?.click()
  }
  const prev = () => {
    ;(
      document.querySelector(
        '.previous-button.ytmusic-player-bar, tp-yt-paper-icon-button[title="Previous"]',
      ) as HTMLElement
    )?.click()
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
    ;(
      document.querySelector(
        'tp-yt-paper-icon-button[title*="Shuffle"], .shuffle-button.ytmusic-player-bar',
      ) as HTMLElement
    )?.click()
  }
  const toggleRepeat = () => {
    ;(
      document.querySelector(
        'tp-yt-paper-icon-button[title*="Repeat"], .repeat-button.ytmusic-player-bar',
      ) as HTMLElement
    )?.click()
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
    const val = Number((e.target as HTMLInputElement).value)
    setVolume(val)
    video.volume = val
  }

  const toggleMute = () => {
    const video = document.querySelector("video")
    if (!video) return
    video.muted = !video.muted
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  const togglePictureInPicture = () => {
    const video = document.querySelector("video")
    if (!video) return
    if (document.pictureInPictureElement) {
      document.exitPictureInPicture()
    } else {
      ;(video as any).requestPictureInPicture()
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
    if (volume() === 0) {
      return volumeOff
    } else if (volume() < 0.5) {
      return volumeDown
    } else {
      return volumeUp
    }
  }

  return (
    <div class="ytmusic-bottom-bar">
      {/* Left Section - Song Info */}
      <div class="ytmusic-left">
        <div class="ytmusic-album-cover">
          {song().imageSrc ? (
            <img src={(song().imageSrc as string) || "/placeholder.svg"} alt="Album cover" />
          ) : (
            <div class="ytmusic-no-cover">
              <svg viewBox="0 0 24 24" width="24" height="24">
                <path
                  d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9zM9 17H7v-7h2zm4 0h-2V7h2zm4 0h-2v-4h2z"
                  fill="currentColor"
                />
              </svg>
            </div>
          )}
        </div>

        <div class="ytmusic-song-info">
          <div class="ytmusic-title">{song().title || "Song Title"}</div>
          <div class="ytmusic-artist">{song().artist || "Artist Name"}</div>
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

          <button class="ytmusic-play-btn" onClick={playPause} title="Play/Pause">
            {isPaused() ? (
              <img src={playArrow} alt="Play" />
            ) : (
              <img src={pause} alt="Pause" />
            )}
          </button>

          <button class="ytmusic-nav-btn" onClick={next} title="Next">
            <img src={skipNext} alt="Next" />
          </button>

          <button
            class={`ytmusic-control-btn ${repeatMode() > 0 ? "active" : ""}`}
            onClick={toggleRepeat}
            title="Repeat"
          >
            <img src={repeat} alt="Repeat" />
            {repeatMode() === 2 && (
              <span style="position: absolute; top: 2px; right: 2px; font-size: 8px; color: #ff0000;">1</span>
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
                "--progress": `${(progress() / (song().songDuration || 1)) * 100}%`,
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
            <img src={getVolumeIcon() || volumeOff} alt="Volume" />
          </button>
          <div class="ytmusic-volume-bar">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume()}
              onInput={onVolumeChange}
              class="ytmusic-volume-slider"
              style={{
                "--volume": `${volume() * 100}%`,
              }}
            />
          </div>
        </div>

        <div class="ytmusic-additional-controls">
          <button class="ytmusic-menu-btn" title="Queue">
            <svg viewBox="0 0 24 24">
              <path
                d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"
                fill="currentColor"
              />
            </svg>
          </button>

          <button class="ytmusic-menu-btn" onClick={togglePictureInPicture} title="Picture in Picture">
            <img src={pictureInPicture} alt="Picture in Picture" />
          </button>

          <button class="ytmusic-menu-btn" onClick={expandSongPage} title="Expand Song">
            <img src={expandSong} alt="Expand Song" />
          </button>

          <button class="ytmusic-menu-btn" onClick={toggleFullscreen} title="Fullscreen">
            <img src={fullscreen} alt="Fullscreen" />
          </button>

          <div style="position: relative;">
            <button
              class="ytmusic-menu-btn"
              onClick={() => setShowDropdown(!showDropdown())}
              data-dropdown-trigger
              title="More Options"
            >
              <svg viewBox="0 0 24 24">
                <path
                  d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"
                  fill="currentColor"
                />
              </svg>
            </button>

            {showDropdown() && (
              <div class="ytmusic-dropdown">
                <button class="ytmusic-dropdown-item" onClick={() => setShowDropdown(false)}>
                  Add to playlist
                </button>
                <button class="ytmusic-dropdown-item" onClick={() => setShowDropdown(false)}>
                  Go to album
                </button>
                <button class="ytmusic-dropdown-item" onClick={() => setShowDropdown(false)}>
                  Go to artist
                </button>
                <div class="ytmusic-dropdown-separator"></div>
                <button class="ytmusic-dropdown-item" onClick={() => setShowDropdown(false)}>
                  Share
                </button>
                <button class="ytmusic-dropdown-item" onClick={() => setShowDropdown(false)}>
                  Copy link
                </button>
                <div class="ytmusic-dropdown-separator"></div>
                <button class="ytmusic-dropdown-item" onClick={() => setShowDropdown(false)}>
                  Show lyrics
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
