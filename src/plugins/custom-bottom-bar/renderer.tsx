"use client"

import { createSignal, onCleanup, onMount } from "solid-js"
import { getSongInfo } from "@/providers/song-info-front"
import type { RendererContext } from '@/types/contexts'
import type { CustomBottomBarPluginConfig } from './index'
import type { YoutubePlayer } from '@/types/youtube-player'
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

// Helper function to debounce function calls
function debounce<T extends (...args: any[]) => any>(func: T, wait: number): T {
  let timeout: number | null = null
  return ((...args: any[]) => {
    if (timeout !== null) clearTimeout(timeout)
    timeout = window.setTimeout(() => func(...args), wait)
  }) as T
}

// Global plugin configuration and API
let pluginConfig: CustomBottomBarPluginConfig
let api: YoutubePlayer

function YTMusicPlayer() {
  // Persistent storage keys (only for volume and mute now)
  const VOLUME_KEY = "ytmusic_custombar_volume"
  const MUTE_KEY = "ytmusic_custombar_muted"

  // Song info state
  const [song, setSong] = createSignal(getSongInfo())
  const [progress, setProgress] = createSignal(0)
  
  // Volume and mute state (internal 0-1 scale)
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
  
  // Volume HUD state
  const [volumeHudVisible, setVolumeHudVisible] = createSignal(false)
  const [volumeHudText, setVolumeHudText] = createSignal("")
  
  // Add a signal to track the current videoId
  const [currentVideoId, setCurrentVideoId] = createSignal<string | null>(null)

  // FIX: Add a flag to prevent UI updates during a "repeat one" cycle
  let isRepeatingOne = false

  // --- Volume sync logic ---
  let isUserVolumeChange = false
  const SYNC_DELAY = 300 // ms

  // Convert between internal scale (0-1) and display scale (0-100)
  const volumeToPercentage = (vol: number) => Math.round(vol * 100)
  const percentageToVolume = (pct: number) => clamp(pct / 100, 0, 1)

  // Get current volume steps from plugin config
  const getVolumeSteps = () => pluginConfig?.volumeSteps || 1
  const getArrowsShortcut = () => pluginConfig?.arrowsShortcut ?? true

  // Volume HUD debounced hide function
  const hideVolumeHud = debounce(() => {
    setVolumeHudVisible(false)
  }, 2000)

  // Persistent settings write (debounced to avoid excessive writes)
  const writeVolumeSettings = debounce(() => {
    try {
      localStorage.setItem(VOLUME_KEY, String(volume()))
      localStorage.setItem(MUTE_KEY, String(isMuted()))
    } catch {}
  }, 1000)

  // Show volume HUD with percentage
  const showVolumeHud = (volumePct: number) => {
    setVolumeHudText(`${volumePct}%`)
    setVolumeHudVisible(true)
    hideVolumeHud()
  }

  // Set volume with all the precise volume functionality
  const setPreciseVolume = (volumePct: number, showHud = true) => {
    const clampedPct = clamp(volumePct, 0, 100)
    const volumeValue = percentageToVolume(clampedPct)
    
    setVolume(volumeValue)
    setIsMuted(false)
    
    // Apply to video element
    isUserVolumeChange = true
    const video = document.querySelector("video") as HTMLVideoElement
    if (video) {
      video.volume = volumeValue
      video.muted = false
    }
    
    // Update YTM's native volume sliders and tooltips
    updateNativeVolumeElements(clampedPct)
    
    if (showHud) {
      showVolumeHud(clampedPct)
    }
    
    writeVolumeSettings()
  }

  // Change volume by steps (for scroll wheel and keyboard shortcuts)
  const changeVolumeBySteps = (increase: boolean) => {
    const currentPct = volumeToPercentage(volume())
    const steps = getVolumeSteps()
    const newPct = increase 
      ? Math.min(currentPct + steps, 100)
      : Math.max(currentPct - steps, 0)
    setPreciseVolume(newPct)
  }

  // Update native YTM volume sliders and tooltips
  const updateNativeVolumeElements = (volumePct: number) => {
    const tooltipTargets = [
      '#volume-slider',
      'tp-yt-paper-icon-button.volume',
      '#expand-volume-slider', 
      '#expand-volume'
    ]
    
    // Update slider values (YTM rounds to multiples of 5)
    const sliderValue = volumePct > 0 && volumePct < 5 ? 5 : volumePct
    for (const selector of ['#volume-slider', '#expand-volume-slider']) {
      const slider = document.querySelector(selector) as HTMLInputElement
      if (slider) {
        slider.value = String(sliderValue)
      }
    }
    
    // Update tooltips to show precise percentage
    for (const selector of tooltipTargets) {
      const element = document.querySelector(selector) as HTMLElement
      if (element) {
        element.title = `${volumePct}%`
      }
    }
  }

  // Override native volume slider behavior to prevent conflicts
  const overrideNativeVolumeSliders = () => {
    const ignoredIds = ['volume-slider', 'expand-volume-slider']
    const ignoredTypes = ['mousewheel', 'keydown', 'keyup']
    
    // Save original addEventListener
    const originalAddEventListener = Element.prototype.addEventListener
    
    Element.prototype.addEventListener = function(type: string, listener: any, useCapture?: boolean) {
      if (!(ignoredIds.includes(this.id) && ignoredTypes.includes(type))) {
        originalAddEventListener.call(this, type, listener, useCapture)
      }
    }
    
    // Restore original after page load
    window.addEventListener('load', () => {
      Element.prototype.addEventListener = originalAddEventListener
    }, { once: true })
  }

  onMount(() => {
    // Override native volume slider behavior first
    overrideNativeVolumeSliders()
    
    // --- Load persistent settings ---
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

    // Initialize plugin config with defaults if not available
    if (!pluginConfig) {
      pluginConfig = {
        enabled: true,
        volumeSteps: 1,
        arrowsShortcut: true
      }
    }

    let lastVideo: HTMLVideoElement | null = null
    let currentVideoEventListeners: (() => void)[] = []

    const attachVideoEventListeners = (video: HTMLVideoElement) => {
      // Remove existing event listeners first
      currentVideoEventListeners.forEach(cleanup => cleanup())
      currentVideoEventListeners = []

      if (!video) return

      const updatePaused = () => {
        setIsPaused(video.paused)
      }

      const onTimeUpdate = () => {
        if (!isSeeking()) {
          // Update progress if videoIds match, or if currentVideoId is null (initial load)
          if (currentVideoId() === song().videoId || currentVideoId() === null) {
            setProgress(video.currentTime)
          }
        }
      }

      const onVolumeChangeFromVideo = () => {
        if (!video || isUserVolumeChange) {
          isUserVolumeChange = false
          return
        }
        setVolume(video.volume)
        setIsMuted(video.muted)
        // Update tooltips when volume changes from video
        updateNativeVolumeElements(volumeToPercentage(video.volume))
      }

      const onLoadStart = () => {
        // New content is loading, sync progress after a brief delay
        setTimeout(() => {
          if (!isSeeking()) {
            setProgress(video.currentTime || 0)
          }
        }, 100)
      }

      const onEnded = () => {
        // Mode 2 is "repeat one".
        if (repeatMode() === 2) {
            console.log('[CustomBar] Video ended on "repeat one". Flagging to prevent UI desync.')
            isRepeatingOne = true
            // Reset the flag after a short delay to allow the player to restart the track
            setTimeout(() => { isRepeatingOne = false }, 1500)
        } else {
            // For normal playback, reset progress to prepare for next song
            setProgress(0)
        }
        // After any song ends, re-check the repeat state, as YTM might auto-change it.
        setTimeout(detectRepeatState, 200)
      }

      // Attach event listeners
      video.addEventListener("pause", updatePaused)
      video.addEventListener("play", updatePaused)
      video.addEventListener("timeupdate", onTimeUpdate)
      video.addEventListener("loadstart", onLoadStart)
      video.addEventListener("ended", onEnded)
      video.addEventListener("volumechange", onVolumeChangeFromVideo)

      // Store cleanup functions
      currentVideoEventListeners.push(
        () => video.removeEventListener("pause", updatePaused),
        () => video.removeEventListener("play", updatePaused),
        () => video.removeEventListener("timeupdate", onTimeUpdate),
        () => video.removeEventListener("loadstart", onLoadStart),
        () => video.removeEventListener("ended", onEnded),
        () => video.removeEventListener("volumechange", onVolumeChangeFromVideo)
      )

      // Update paused state immediately
      updatePaused()
      
      console.log('[CustomBar] Video event listeners attached to new video element')
    }

    const applyCurrentStateToVideo = (video: HTMLVideoElement | null) => {
      if (!video) return
      
      // If this is a new video element, attach event listeners
      if (video !== lastVideo) {
        video.volume = volume()
        video.muted = isMuted()
        attachVideoEventListeners(video)
        lastVideo = video
        
        // Update tooltips for new video
        updateNativeVolumeElements(volumeToPercentage(volume()))
      }
    }
    
    // Apply to initial video element
    applyCurrentStateToVideo(document.querySelector("video"))
    
    const videoObserver = new MutationObserver(() => {
      const video = document.querySelector("video")
      applyCurrentStateToVideo(video)
      
      // If a new video element is found, sync progress immediately
      if (video && video !== lastVideo) {
        setTimeout(() => {
          if (!isSeeking()) {
            setProgress(video.currentTime || 0)
          }
        }, 50)
      }
    })
    videoObserver.observe(document.body, { childList: true, subtree: true })

    // --- Setup scroll wheel support ---
    const setupScrollWheelSupport = () => {
      // Video player area scroll wheel
      const mainPanel = document.querySelector('#main-panel') as HTMLElement
      if (mainPanel) {
        mainPanel.addEventListener('wheel', (event) => {
          event.preventDefault()
          changeVolumeBySteps(event.deltaY < 0)
        })
      }
      
      // Player bar scroll wheel
      const playerBar = document.querySelector('ytmusic-player-bar') as HTMLElement
      if (playerBar) {
        playerBar.addEventListener('wheel', (event) => {
          event.preventDefault()
          changeVolumeBySteps(event.deltaY < 0)
        })
      }
    }

    // --- Setup keyboard shortcuts ---
    const setupKeyboardShortcuts = () => {
      window.addEventListener('keydown', (event) => {
        if (!getArrowsShortcut()) return
        
        // Don't interfere when search box is open
        const searchBox = document.querySelector('ytmusic-search-box') as HTMLElement & { opened: boolean }
        if (searchBox?.opened) return
        
        switch (event.code) {
          case 'ArrowUp':
            event.preventDefault()
            changeVolumeBySteps(true)
            break
          case 'ArrowDown':
            event.preventDefault()
            changeVolumeBySteps(false)
            break
        }
      })
    }

    // --- Periodic state verification ---
    // Add a periodic check to ensure event listeners are still working
    const stateVerificationInterval = setInterval(() => {
      const video = document.querySelector("video") as HTMLVideoElement
      if (video && video !== lastVideo) {
        console.log('[CustomBar] Detected video element change during periodic check, reattaching listeners')
        applyCurrentStateToVideo(video)
      } else if (video) {
        // Verify that our paused state matches the actual video state
        if (isPaused() !== video.paused) {
          console.log(`[CustomBar] State mismatch detected: isPaused=${isPaused()}, video.paused=${video.paused}, syncing...`)
          setIsPaused(video.paused)
        }
      }
    }, 3000) // Check every 3 seconds

    // --- Initial progress sync ---
    // Immediately sync progress with current video state on mount
    const initialVideo = document.querySelector("video") as HTMLVideoElement
    if (initialVideo) {
      setProgress(initialVideo.currentTime || 0)
      // Set current video ID from song info if not set
      if (!currentVideoId() && song().videoId) {
        setCurrentVideoId(song().videoId)
      }
      // Apply stored volume to initial video
      initialVideo.volume = volume()
      initialVideo.muted = isMuted()
      updateNativeVolumeElements(volumeToPercentage(volume()))
    }

    // Setup enhanced volume features
    setupScrollWheelSupport()
    setupKeyboardShortcuts()

    // --- Ensure sidebar stays expanded ---
    ensureSidebarExpanded()
    
    // Watch for DOM changes that might affect sidebar (throttled to avoid performance issues)
    let sidebarCheckTimeout: number | null = null;
    const sidebarObserver = new MutationObserver(() => {
      if (sidebarCheckTimeout) clearTimeout(sidebarCheckTimeout);
      sidebarCheckTimeout = window.setTimeout(() => {
        ensureSidebarExpanded()
      }, 1000); // Check every second at most
    })
    sidebarObserver.observe(document.body, { childList: true, subtree: false }) // Only watch direct children

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

        const isNewSong = currentVideoId() !== newSong.videoId
        setSong(newSong)
        setCurrentVideoId(newSong.videoId)
        
        // Sync play/pause state from song info as fallback
        if (typeof newSong.isPaused === 'boolean' && newSong.isPaused !== isPaused()) {
          console.log(`[CustomBar] Syncing paused state from song info: ${isPaused()} -> ${newSong.isPaused}`)
          setIsPaused(newSong.isPaused)
        }
        
        // For new songs, ensure progress starts from the beginning
        if (isNewSong) {
            setProgress(0)
            // Sync with video element after a brief delay
            setTimeout(() => {
                const video = getVideo()
                if (video) {
                    setProgress(video.currentTime || 0)
                }
            }, 100)
        } else {
            // For same song (like seeking), use the provided elapsed time
            setProgress(newSong.elapsedSeconds || 0)
        }
        
        // Detect like state for the new song
        setTimeout(detectLikeState, 200)
    }
    window.ipcRenderer.on("ytmd:update-song-info", handler)

    // Add a direct IPC listener for play/pause state changes as additional fallback
    const playPauseHandler = (_: any, data: { isPaused: boolean; elapsedSeconds: number }) => {
      if (typeof data.isPaused === 'boolean' && data.isPaused !== isPaused()) {
        console.log(`[CustomBar] Syncing paused state via IPC play-or-paused: ${isPaused()} -> ${data.isPaused}`)
        setIsPaused(data.isPaused)
      }
      if (typeof data.elapsedSeconds === 'number') {
        setProgress(data.elapsedSeconds)
      }
    }
    window.ipcRenderer.on("ytmd:play-or-paused", playPauseHandler)

    // Helper function to get video element
    const getVideo = () => document.querySelector("video") as HTMLVideoElement | null

    // Progress update interval (more frequent for smooth progress bar)
    const progressInterval = setInterval(() => {
      const video = getVideo()
      if (video && !isSeeking() && !video.paused) {
        // Update progress if videoIds match, or if currentVideoId is null (initial load)
        if (currentVideoId() === song().videoId || currentVideoId() === null) {
          setProgress(video.currentTime)
        }
      }
    }, 250) // Update progress every 250ms for smoother bar

    // General state check interval
    const stateInterval = setInterval(() => {
      // Periodically check state for resilience
      detectShuffleState()
      detectRepeatState()
      detectLikeState()
    }, 2000) // Check states every 2 seconds

    // --- Sync shuffle/repeat state on mount ---
    setTimeout(() => {
        requestShuffle()
        requestRepeat()
        detectShuffleState()
        detectRepeatState()
        detectLikeState()
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
    
    // NEW: Monitor for changes in like/dislike buttons
    const setupLikeButtonWatcher = () => {
      const likeButtonRenderer = document.querySelector('#like-button-renderer')
      
      const likeObserver = new MutationObserver(detectLikeState)
      
      if (likeButtonRenderer) {
        // Watch for changes in the like button renderer (including its children)
        likeObserver.observe(likeButtonRenderer, { 
          attributes: true, 
          childList: true, 
          subtree: true,
          attributeFilter: ['aria-pressed']
        })
      }
      
      // Also observe the document for when the like-button-renderer is created/recreated
      const documentObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            // Check if like-button-renderer was added
            const hasLikeButtonRenderer = document.querySelector('#like-button-renderer')
            
            if (hasLikeButtonRenderer) {
              detectLikeState()
              // Re-setup observer for the new renderer
              setTimeout(() => {
                const newLikeButtonRenderer = document.querySelector('#like-button-renderer')
                if (newLikeButtonRenderer) {
                  likeObserver.observe(newLikeButtonRenderer, { 
                    attributes: true, 
                    childList: true, 
                    subtree: true,
                    attributeFilter: ['aria-pressed']
                  })
                }
              }, 100)
            }
          }
        }
      })
      
      documentObserver.observe(document.body, { childList: true, subtree: true })
      
      return () => {
        likeObserver.disconnect()
        documentObserver.disconnect()
      }
    }
    
    const cleanupRepeatWatcher = setupRepeatButtonWatcher()
    const cleanupLikeWatcher = setupLikeButtonWatcher()

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

    // Listen for shuffle/repeat state updates
    window.ipcRenderer.on("ytmd:shuffle-changed", handleShuffleChanged)
    window.ipcRenderer.on("ytmd:repeat-changed", handleRepeatChanged)

    onCleanup(() => {
      window.ipcRenderer.off("ytmd:update-song-info", handler)
      window.ipcRenderer.off("ytmd:play-or-paused", playPauseHandler)
      if (lastVideo) { // Check if lastVideo is not null
        currentVideoEventListeners.forEach(cleanup => cleanup())
      }
      clearInterval(progressInterval)
      clearInterval(stateInterval)
      clearInterval(stateVerificationInterval) // Clear the new interval
      cleanupRepeatWatcher()
      cleanupLikeWatcher()
      window.ipcRenderer.off("ytmd:shuffle-changed", handleShuffleChanged)
      window.ipcRenderer.off("ytmd:repeat-changed", handleRepeatChanged)
      document.removeEventListener("click", handleClickOutside)
      videoObserver?.disconnect()
      sidebarObserver?.disconnect()
      observer?.disconnect()
    })
  })

  // --- Sidebar expansion logic ---
  const ensureSidebarExpanded = () => {
    // Check if the sidebar is in compact mode (mini-guide visible)
    const miniGuide = document.querySelector('#mini-guide') as HTMLElement;
    const mainGuide = document.querySelector('ytmusic-guide-renderer') as HTMLElement;
    
    if (miniGuide && mainGuide) {
      // If mini-guide is visible, that means we're in compact mode - expand it
      const miniGuideVisible = window.getComputedStyle(miniGuide).display !== 'none';
      const mainGuideVisible = window.getComputedStyle(mainGuide).display !== 'none';
      
      if (miniGuideVisible && !mainGuideVisible) {
        // Find the sidebar toggle button - try multiple selectors
        const toggleSelectors = [
          '#button', // The main toggle button
          'ytmusic-guide-renderer #button',
          '[aria-label*="guide" i]',
          'button[aria-label*="menu" i]',
          'ytmusic-nav-bar #button'
        ];
        
        for (const selector of toggleSelectors) {
          const toggleButton = document.querySelector(selector) as HTMLElement;
          if (toggleButton && toggleButton.offsetParent !== null) { // Check if button is visible
            console.log('Expanding sidebar from compact mode using selector:', selector);
            toggleButton.click();
            break;
          }
        }
      }
    }
  }

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

  // NEW: Detect like/dislike state from YouTube Music
  function detectLikeState() {
    // Try to find the like button renderer for the currently playing song
    const likeButtonRenderer = document.querySelector('#like-button-renderer')
    
    if (likeButtonRenderer) {
      // Look for the actual like and dislike buttons within the renderer
      const likeButton = likeButtonRenderer.querySelector('button[aria-label="Like"]')
      const dislikeButton = likeButtonRenderer.querySelector('button[aria-label="Dislike"]')
      
      if (likeButton && dislikeButton) {
        // Check if the buttons have the active state (pressed)
        const isLikedState = likeButton.getAttribute('aria-pressed') === 'true'
        const isDislikedState = dislikeButton.getAttribute('aria-pressed') === 'true'
        
        // Update state only if it's different to avoid unnecessary re-renders
        if (isLikedState !== isLiked()) {
          setIsLiked(isLikedState)
          console.log('[CustomBar] Like state changed:', isLikedState)
        }
        if (isDislikedState !== isDisliked()) {
          setIsDisliked(isDislikedState)
          console.log('[CustomBar] Dislike state changed:', isDislikedState)
        }
      }
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
    // Use the proper YouTube Music API method for the currently playing song
    const likeButtonRenderer = document.querySelector('#like-button-renderer') as HTMLElement & { updateLikeStatus: (status: string) => void }
    if (likeButtonRenderer && likeButtonRenderer.updateLikeStatus) {
      likeButtonRenderer.updateLikeStatus('LIKE')
      // Re-detect state after a short delay to sync with YouTube Music
      setTimeout(detectLikeState, 100)
    } else {
      // Fallback to IPC system
      window.ipcRenderer.send("ytmd:update-like", "LIKE")
      setTimeout(detectLikeState, 100)
    }
  }

  const toggleDislike = () => {
    // Use the proper YouTube Music API method for the currently playing song
    const likeButtonRenderer = document.querySelector('#like-button-renderer') as HTMLElement & { updateLikeStatus: (status: string) => void }
    if (likeButtonRenderer && likeButtonRenderer.updateLikeStatus) {
      likeButtonRenderer.updateLikeStatus('DISLIKE')
      // Re-detect state after a short delay to sync with YouTube Music
      setTimeout(detectLikeState, 100)
    } else {
      // Fallback to IPC system
      window.ipcRenderer.send("ytmd:update-like", "DISLIKE")
      setTimeout(detectLikeState, 100)
    }
  }

  const toggleShuffle = () => {
    (document.querySelector('yt-icon-button.shuffle button') as HTMLElement)?.click()
    setTimeout(requestShuffle, SYNC_DELAY)
  }

  const toggleRepeat = () => {
    (document.querySelector('yt-icon-button.repeat button') as HTMLElement)?.click()
    setTimeout(requestRepeat, SYNC_DELAY)
  }

  const onSeekInput = (e: Event) => {
    // Update progress immediately for smooth visual feedback
    const val = Number((e.target as HTMLInputElement).value)
    setProgress(val)
  }

  const onSeekStart = () => {
    setIsSeeking(true)
  }

  const onSeekEnd = (e: Event) => {
    // Actually seek the video and end seeking state
    const video = document.querySelector("video")
    if (!video) return
    const val = Number((e.target as HTMLInputElement).value)
    setProgress(val)
    video.currentTime = val
    
    // Small delay before ending seeking state to prevent flickering
    setTimeout(() => {
      setIsSeeking(false)
    }, 50)
  }

  const onSeekChange = (e: Event) => {
    // Fallback for when mouseup doesn't fire (e.g., dragging outside)
    if (isSeeking()) {
      onSeekEnd(e)
    }
  }

  const onSeekKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      setIsSeeking(true)
      const video = document.querySelector("video")
      if (!video) return
      
      const step = 5 // 5 second increments
      const newTime = e.key === 'ArrowLeft' 
        ? Math.max(0, progress() - step)
        : Math.min(song().songDuration || 0, progress() + step)
      
      setProgress(newTime)
      video.currentTime = newTime
      
      setTimeout(() => {
        setIsSeeking(false)
      }, 100)
    }
  }

  const onVolumeChange = (e: Event) => {
    const val = clamp(Number((e.target as HTMLInputElement).value), 0, 1)
    const volumePct = volumeToPercentage(val)
    setPreciseVolume(volumePct, false) // Don't show HUD for slider changes
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
    
    if (newMuted) {
      showVolumeHud(0)
    } else {
      showVolumeHud(volumeToPercentage(volume()))
    }
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
      {/* Volume HUD */}
      <div 
        class="ytmusic-volume-hud" 
        style={{
          opacity: volumeHudVisible() ? '1' : '0',
          position: 'fixed',
          top: '20px',
          right: '20px',
          'z-index': '9999',
          background: 'rgba(0, 0, 0, 0.8)',
          color: '#fff',
          padding: '12px 20px',
          'border-radius': '6px',
          'font-size': '18px',
          'font-weight': '600',
          'text-shadow': '0 0 12px rgba(0, 0, 0, 0.5)',
          transition: 'opacity 0.6s',
          'pointer-events': 'none'
        }}
      >
        {volumeHudText()}
      </div>

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
            title={`Repeat ${repeatMode() === 0 ? 'off' : repeatMode() === 1 ? 'all' : 'one'} • Volume: ${volumeToPercentage(volume())}% (±${getVolumeSteps()}% steps)`}
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
              onInput={onSeekInput}
              onChange={onSeekChange}
              onMouseDown={onSeekStart}
              onMouseUp={onSeekEnd}
              onTouchStart={onSeekStart}
              onTouchEnd={onSeekEnd}
              onKeyDown={onSeekKeyDown}
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
          <button 
            class="ytmusic-volume-btn" 
            onClick={toggleMute} 
            title={`${isMuted() ? 'Unmute' : 'Mute'} • Volume: ${volumeToPercentage(volume())}%`}
          >
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
              title={`Volume: ${volumeToPercentage(volume())}% • Steps: ${getVolumeSteps()}% • Scroll wheel: ±${getVolumeSteps()}% • Arrows: ${getArrowsShortcut() ? 'Enabled' : 'Disabled'}`}
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

// Plugin lifecycle functions
export const onPlayerApiReady = async (
  playerApi: YoutubePlayer,
  context: RendererContext<CustomBottomBarPluginConfig>,
) => {
  pluginConfig = await context.getConfig()
  api = playerApi
}

export const onConfigChange = (config: CustomBottomBarPluginConfig) => {
  pluginConfig = config
}

export default YTMusicPlayer