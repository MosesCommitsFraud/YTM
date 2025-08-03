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
  // Song info state
  const [song, setSong] = createSignal(getSongInfo())
  
  // Progress tracking state - using native YTM progress bar
  const [progress, setProgress] = createSignal(0)
  const [isSeeking, setIsSeeking] = createSignal(false)
  
  // Media tracking - handles both audio-only and video content
  const [currentVideoId, setCurrentVideoId] = createSignal<string | null>(null)
  const [currentMediaElement, setCurrentMediaElement] = createSignal<HTMLVideoElement | null>(null)
  const [isVideoContent, setIsVideoContent] = createSignal(false)
  
  // Native progress bar reference
  let nativeProgressBar: HTMLElement | null = null
  
  // Volume sync logic
  let isUserVolumeChange = false
  let userVolumeChangeTimeout: number | null = null
  const SYNC_DELAY = 300 // ms
  
  // Volume and mute state (internal 0-1 scale)
  const [volume, setVolume] = createSignal(1)
  const [isMuted, setIsMuted] = createSignal(false)
  const [isDraggingVolume, setIsDraggingVolume] = createSignal(false)
  const [isLiked, setIsLiked] = createSignal(false)
  const [isDisliked, setIsDisliked] = createSignal(false)
  const [isShuffle, setIsShuffle] = createSignal(false)
  // CORRECTED STATE LOGIC: 0 = off, 1 = repeat all, 2 = repeat one. This matches YTM's internal logic.
  const [repeatMode, setRepeatMode] = createSignal(0)
  const [isPaused, setIsPaused] = createSignal(true)
  const [, setShowDropdown] = createSignal(false)
  const [isExpanded, setIsExpanded] = createSignal(false)
  
  // Volume HUD state
  const [volumeHudVisible, setVolumeHudVisible] = createSignal(false)
  const [volumeHudText, setVolumeHudText] = createSignal("")
  
  // Helper to determine if current track has video content
  const hasVideoContent = () => {
    const mediaType = song().mediaType
    return (
      mediaType === 'ORIGINAL_MUSIC_VIDEO' ||
      mediaType === 'USER_GENERATED_CONTENT' ||
      mediaType === 'OTHER_VIDEO'
    )
  }

  // === PROGRESS TRACKING SETUP ===
  // Setup functions defined before onMount to avoid hoisting issues
  let nativeProgressObserver: MutationObserver | null = null
  let mediaListenerCleanup: (() => void)[] = []
  let progressUpdateInterval: number | null = null
  
  const cleanupMediaListeners = () => {
    mediaListenerCleanup.forEach(cleanup => cleanup())
    mediaListenerCleanup = []
    if (nativeProgressObserver) {
      nativeProgressObserver.disconnect()
      nativeProgressObserver = null
    }
    if (progressUpdateInterval) {
      clearInterval(progressUpdateInterval)
      progressUpdateInterval = null
    }
  }
  
  // Track the last known native progress update time to detect if native tracking is working
  let lastNativeUpdate = 0
  let nativeTrackingWorking = true
  
  const setupProgressTracking = () => {
    // Clear any existing progress tracking
    if (progressUpdateInterval) {
      clearInterval(progressUpdateInterval)
      progressUpdateInterval = null
    }
    if (nativeProgressObserver) {
      nativeProgressObserver.disconnect()
      nativeProgressObserver = null
    }
    
    // Reset tracking state
    lastNativeUpdate = Date.now()
    nativeTrackingWorking = true
    
    // Find the native progress bar element
    nativeProgressBar = document.querySelector('#progress-bar')
    
    // Setup native progress bar observer if available
    if (nativeProgressBar) {
      nativeProgressObserver = new MutationObserver((mutations) => {
        if (isSeeking()) return // Don't update while user is seeking
        
        for (const mutation of mutations) {
          const target = mutation.target as HTMLElement & { value: string }
          if (mutation.attributeName === 'value') {
            const newValue = Number(target.value) || 0
            if (newValue >= 0 && isFinite(newValue)) {
              setProgress(newValue)
              lastNativeUpdate = Date.now()
              nativeTrackingWorking = true
            }
          }
        }
      })
      
      nativeProgressObserver.observe(nativeProgressBar, { 
        attributeFilter: ['value'] 
      })
      
      // Initial sync
      const initialValue = Number((nativeProgressBar as any).value) || 0
      setProgress(initialValue)
      lastNativeUpdate = Date.now()
    } else {
      // If no native progress bar, fallback is the primary method
      nativeTrackingWorking = false
    }
    
    // SMART FALLBACK: Only kicks in when native tracking fails
    progressUpdateInterval = window.setInterval(() => {
      if (isSeeking()) return // Don't update while user is seeking
      
      const now = Date.now()
      const timeSinceLastNativeUpdate = now - lastNativeUpdate
      
      // Only use fallback if native tracking hasn't updated in 3+ seconds AND media is playing
      if (timeSinceLastNativeUpdate > 3000 || !nativeTrackingWorking) {
        const mediaElement = currentMediaElement()
        if (mediaElement && !mediaElement.paused) {
          const currentTime = mediaElement.currentTime
          if (currentTime >= 0 && isFinite(currentTime)) {
            const currentProgress = progress()
            
            // Only update if media time is significantly different from our progress
            // This prevents flickering when both systems are working
            if (Math.abs(currentTime - currentProgress) > 2) {
              setProgress(currentTime)
            }
          }
        }
      }
    }, 2000) // Check every 2 seconds
    
    // If native progress bar not found, retry later
    if (!nativeProgressBar) {
      setTimeout(setupProgressTracking, 1000)
    }
  }
  
  const setupMediaListeners = (mediaElement: HTMLVideoElement) => {
    // Play/pause state sync
    const onPlayPause = () => {
      setIsPaused(mediaElement.paused)
      // Reset native tracking timer when play state changes
      lastNativeUpdate = Date.now()
    }
    
    // Volume sync
    const onVolumeChange = () => {
      if (!isDraggingVolume() && !isUserVolumeChange) {
        const mediaVolume = mediaElement.volume
        const mediaMuted = mediaElement.muted
        
        if (Math.abs(mediaVolume - volume()) > 0.02) {
          setVolume(mediaVolume)
        }
        if (mediaMuted !== isMuted()) {
          setIsMuted(mediaMuted)
        }
      }
    }
    
    // Content type detection and media loading
    const onLoadStart = () => {
      setIsVideoContent(hasVideoContent())
      // Reset progress tracking when a new media starts loading
      // This prevents old currentTime values from interfering
      lastNativeUpdate = Date.now()
      nativeTrackingWorking = true
    }
    
    // When media actually starts playing, ensure we have clean progress tracking
    const onCanPlay = () => {
      // Give native progress bar a moment to initialize properly
      setTimeout(() => {
        lastNativeUpdate = Date.now()
        nativeTrackingWorking = true
      }, 100)
    }
    
    // Attach listeners - progress tracking is handled by separate system
    mediaElement.addEventListener('play', onPlayPause)
    mediaElement.addEventListener('pause', onPlayPause)
    mediaElement.addEventListener('loadstart', onLoadStart)
    mediaElement.addEventListener('canplay', onCanPlay)
    mediaElement.addEventListener('volumechange', onVolumeChange)
    
    // Store cleanup functions
    mediaListenerCleanup.push(
      () => mediaElement.removeEventListener('play', onPlayPause),
      () => mediaElement.removeEventListener('pause', onPlayPause),
      () => mediaElement.removeEventListener('loadstart', onLoadStart),
      () => mediaElement.removeEventListener('canplay', onCanPlay),
      () => mediaElement.removeEventListener('volumechange', onVolumeChange)
    )
    
    // Initial state sync
    onPlayPause()
    setIsVideoContent(hasVideoContent())
  }

  // === VOLUME CONTROLS ===
  // Work identically for both audio and video content
  
  // Persistent storage keys
  const VOLUME_KEY = "ytmusic_custombar_volume"
  const MUTE_KEY = "ytmusic_custombar_muted"
  
  // Convert between internal scale (0-1) and display scale (0-100)
  const volumeToPercentage = (vol: number) => Math.round(vol * 100)
  
  // Get current volume steps from plugin config
  const getVolumeSteps = () => {
    const steps = pluginConfig?.volumeSteps || 5
    return Math.max(1, Math.min(steps, 20))
  }
  const getArrowsShortcut = () => pluginConfig?.arrowsShortcut ?? true
  
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
  
  // Volume HUD debounced hide function
  const hideVolumeHud = debounce(() => {
    setVolumeHudVisible(false)
  }, 2000)
  
  // Set volume with all the precise volume functionality
  const setPreciseVolume = (volumePct: number, showHud = true) => {
    const clampedPct = clamp(volumePct, 0, 100)
    setVolume(clampedPct / 100)
    
    // Only unmute if we're setting a volume > 0
    if (clampedPct > 0) {
      setIsMuted(false)
    }

    // Use the YTM API
    if (api && typeof api.setVolume === "function") {
      api.setVolume(clampedPct)
    }

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
    if (isUpdatingNativeElements) return // Prevent recursive calls
    
    isUpdatingNativeElements = true
    
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
    
    // Reset flag after a brief delay
    setTimeout(() => {
      isUpdatingNativeElements = false
    }, 100)
  }

  // Volume sync variables
  let isUpdatingNativeElements = false
  
  const toggleMute = () => {
    const mediaElement = currentMediaElement()
    if (!mediaElement) return
    
    const newMuted = !mediaElement.muted
    setIsMuted(newMuted)
    isUserVolumeChange = true
    mediaElement.muted = newMuted
    
    // Clear user volume change flag
    if (userVolumeChangeTimeout) {
      clearTimeout(userVolumeChangeTimeout)
    }
    userVolumeChangeTimeout = window.setTimeout(() => {
      isUserVolumeChange = false
    }, SYNC_DELAY)
    
    try {
      localStorage.setItem(MUTE_KEY, String(newMuted))
    } catch {}
    
    if (newMuted) {
      showVolumeHud(0)
    } else {
      showVolumeHud(volumeToPercentage(volume()))
    }
  }

  const onVolumeInput = (e: Event) => {
    // Handle volume slider input (while dragging)
    const val = clamp(Number((e.target as HTMLInputElement).value), 0, 1)
    const volumePct = volumeToPercentage(val)
    setVolume(val)
    setIsMuted(false)
    
    // Use the YTM API for immediate feedback
    if (api && typeof api.setVolume === "function") {
      api.setVolume(volumePct)
    }
    
    writeVolumeSettings()
  }

  const onVolumeChange = (e: Event) => {
    // Handle volume slider change (when dragging ends)
    const val = clamp(Number((e.target as HTMLInputElement).value), 0, 1)
    const volumePct = volumeToPercentage(val)
    setPreciseVolume(volumePct, false)
    setIsDraggingVolume(false)
  }

  const onVolumeMouseDown = () => {
    setIsDraggingVolume(true)
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

  // Override native volume slider behavior to prevent conflicts
  const overrideNativeVolumeSliders = () => {
    const ignoredIds = ['volume-slider', 'expand-volume-slider']
    const ignoredTypes = ['mousewheel', 'keydown', 'keyup', 'input', 'change', 'wheel', 'click', 'mousedown', 'mouseup', 'touchstart', 'touchend']
    
    // Save original addEventListener
    const originalAddEventListener = Element.prototype.addEventListener
    
    Element.prototype.addEventListener = function(type: string, listener: any, useCapture?: boolean) {
      if (!(ignoredIds.includes(this.id) && ignoredTypes.includes(type))) {
        originalAddEventListener.call(this, type, listener, useCapture)
      }
    }
    
    // Also completely disable native sliders by making them non-interactive
    const disableNativeSliders = () => {
      for (const selector of ['#volume-slider', '#expand-volume-slider']) {
        const slider = document.querySelector(selector) as HTMLInputElement
        if (slider && !slider.dataset.customBarDisabled) {
          slider.style.pointerEvents = 'none'
          slider.style.opacity = '0.7'
          slider.disabled = true
          slider.dataset.customBarDisabled = 'true'
          
          // Remove any existing event listeners by cloning and replacing
          const newSlider = slider.cloneNode(true) as HTMLInputElement
          newSlider.dataset.customBarDisabled = 'true'
          slider.parentNode?.replaceChild(newSlider, slider)
        }
      }
    }
    
    // Run immediately and then periodically to catch dynamically created sliders
    disableNativeSliders()
    setInterval(disableNativeSliders, 2000)
    
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
    
    // Determine initial volume - prefer stored volume, but check what's actually playing
    let initialVolume = storedVolume
    const startupVideo = document.querySelector("video") as HTMLVideoElement
    
    if (startupVideo && !isNaN(startupVideo.volume)) {
      // If video has a different volume and we don't have a stored preference, use video volume
      if (storedVolume === 1 && startupVideo.volume !== 1) {
        initialVolume = startupVideo.volume
      }
    }
    
    // If API is available and we don't have a stored preference, check API volume
    if (api && typeof api.getVolume === "function" && storedVolume === 1) {
      const apiVol = api.getVolume()
      if (typeof apiVol === "number" && apiVol !== 100) {
        initialVolume = clamp(apiVol / 100, 0, 1)
      }
    }
    
    setVolume(initialVolume)
    setIsMuted(storedMuted)
    
    // Ensure all volume systems are synchronized from the start
    setTimeout(() => {
      const finalVolume = Math.round(initialVolume * 100)
      
      // Set YTM API volume
      if (api && typeof api.setVolume === "function") {
        api.setVolume(finalVolume)
      }
      
      // Set video element volume if it exists
      if (startupVideo) {
        startupVideo.volume = initialVolume
        startupVideo.muted = storedMuted
      }
      
      // Update native elements
      updateNativeVolumeElements(finalVolume)
      
      // Force UI update to show correct volume
      setVolume(initialVolume)
    }, 200)

    // Initialize plugin config with defaults if not available
    if (!pluginConfig) {
      pluginConfig = {
        enabled: true,
        volumeSteps: 5,
        arrowsShortcut: true
      }
    }

    // === CORE MEDIA TRACKING SYSTEM ===
    // Handles both audio-only tracks and video content seamlessly
    
    // 1. Setup robust progress tracking (native + fallback)
    setupProgressTracking()
    
    // 2. Media Element Manager - For volume sync and play/pause state
    const setupMediaElementTracking = () => {
      const findAndSetupMedia = () => {
        const mediaElement = document.querySelector("video") as HTMLVideoElement
        const currentMedia = currentMediaElement()
        
        // Only setup if we have a new media element
        if (mediaElement && mediaElement !== currentMedia) {
          // Cleanup old listeners
          if (currentMedia) {
            cleanupMediaListeners()
          }
          
          setCurrentMediaElement(mediaElement)
          setupMediaListeners(mediaElement)
          
          // Update video content state
          setIsVideoContent(hasVideoContent())
        }
        
        return mediaElement
      }
      
      // Initial setup
      findAndSetupMedia()
      
      // Monitor for new media elements (happens on navigation, etc.)
      const mediaObserver = new MutationObserver(() => {
        findAndSetupMedia()
      })
      mediaObserver.observe(document.body, { childList: true, subtree: true })
      
      return () => mediaObserver.disconnect()
    }



    // 3. Simplified Song Info Handler - Native progress bar handles progress automatically
    const handleSongUpdate = (_: any, newSong: any) => {
      const oldVideoId = currentVideoId()
      const newVideoId = newSong.videoId
      
      // Update song info
      setSong(newSong)
      
      // Track video ID changes for content type detection
      if (oldVideoId !== newVideoId) {
        setCurrentVideoId(newVideoId)
        setIsVideoContent(hasVideoContent())
        
        // CRITICAL FIX: Reset progress to 0 when a new song starts
        // This ensures the progress bar doesn't show the previous song's progress
        setProgress(0)
        
        // Re-establish progress tracking for the new song
        // This is crucial because the media element or native progress bar might have changed
        setTimeout(() => {
          setupProgressTracking()
        }, 200)
        
        // Detect like state for the new song
        setTimeout(detectLikeState, 300)
      }
      
      // Sync play/pause state if provided
      if (typeof newSong.isPaused === 'boolean') {
        setIsPaused(newSong.isPaused)
      }
    }

    // Direct IPC listener for play/pause state changes
    const playPauseHandler = (_: any, data: { isPaused: boolean }) => {
      if (typeof data.isPaused === 'boolean' && data.isPaused !== isPaused()) {
        setIsPaused(data.isPaused)
      }
    }
    window.ipcRenderer.on("ytmd:play-or-paused", playPauseHandler)

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

    // Close dropdown when clicking outside and reset volume dragging state
    const handleClickOutside = (e: MouseEvent) => {
      if (
        !(e.target as Element).closest(".ytmusic-dropdown") &&
        !(e.target as Element).closest("[data-dropdown-trigger]")
      ) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("click", handleClickOutside)

    // Reset volume dragging state on mouse up anywhere (safety mechanism)
    const handleGlobalMouseUp = () => {
      if (isDraggingVolume()) {
        setIsDraggingVolume(false)
        // Update native sliders now that dragging is done
        updateNativeVolumeElements(volumeToPercentage(volume()))
      }
    }
    document.addEventListener("mouseup", handleGlobalMouseUp)
    document.addEventListener("touchend", handleGlobalMouseUp)

    // Listen for shuffle/repeat state updates
    window.ipcRenderer.on("ytmd:shuffle-changed", handleShuffleChanged)
    window.ipcRenderer.on("ytmd:repeat-changed", handleRepeatChanged)

    // Setup the unified tracking system
    const cleanupMediaTracking = setupMediaElementTracking()
    
    // Register song update handler
    window.ipcRenderer.on("ytmd:update-song-info", handleSongUpdate)

    // --- Sync shuffle/repeat state on mount ---
    setTimeout(() => {
        requestShuffle()
        requestRepeat()
        detectShuffleState()
        detectRepeatState()
        detectLikeState()
    }, 1000)

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
      // Use the YTM API for volume
      if (api && typeof api.setVolume === "function") {
        api.setVolume(volume() * 100)
      }
      updateNativeVolumeElements(volumeToPercentage(volume()))
    }

    // Setup enhanced volume features
    setupScrollWheelSupport()
    setupKeyboardShortcuts()

    // General state check interval
    const stateInterval = setInterval(() => {
      // Periodically check state for resilience
      detectShuffleState()
      detectRepeatState()
      detectLikeState()
    }, 2000) // Check states every 2 seconds

    // Cleanup function
    onCleanup(() => {
      window.ipcRenderer.off("ytmd:update-song-info", handleSongUpdate)
      window.ipcRenderer.off("ytmd:play-or-paused", playPauseHandler)
      cleanupMediaTracking()
      cleanupMediaListeners() // Clean up media listeners, progress observer, and progress interval
      clearInterval(stateInterval)
      if (userVolumeChangeTimeout) {
        clearTimeout(userVolumeChangeTimeout)
      }
      cleanupRepeatWatcher()
      cleanupLikeWatcher()
      window.ipcRenderer.off("ytmd:shuffle-changed", handleShuffleChanged)
      window.ipcRenderer.off("ytmd:repeat-changed", handleRepeatChanged)
      document.removeEventListener("click", handleClickOutside)
      document.removeEventListener("mouseup", handleGlobalMouseUp)
      document.removeEventListener("touchend", handleGlobalMouseUp)
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
            toggleButton.click();
            break;
          }
        }
      }
    }
  }

  // === STATE DETECTION HELPERS ===
  
  // Helper to request shuffle/repeat state
  const requestShuffle = () => {
    window.ipcRenderer.send("ytmd:get-shuffle")
  }
  const requestRepeat = () => {
    window.ipcRenderer.send("ytmd:get-repeat")
  }

  // Helper to detect DOM state directly (fallback)
  const detectShuffleState = () => {
    const shuffleBtn = document.querySelector('yt-icon-button.shuffle, button[aria-label*="Shuffle"]')
    if (shuffleBtn) {
      const isActive = shuffleBtn.classList.contains('style-primary-text') || 
                      shuffleBtn.getAttribute('aria-pressed') === 'true'
      setIsShuffle(isActive)
    }
  }

  // Detect like/dislike state from YouTube Music
  const detectLikeState = () => {
    const likeButtonRenderer = document.querySelector('#like-button-renderer')
    
    if (likeButtonRenderer) {
      const likeButton = likeButtonRenderer.querySelector('button[aria-label="Like"]')
      const dislikeButton = likeButtonRenderer.querySelector('button[aria-label="Dislike"]')
      
      if (likeButton && dislikeButton) {
        const isLikedState = likeButton.getAttribute('aria-pressed') === 'true'
        const isDislikedState = dislikeButton.getAttribute('aria-pressed') === 'true'
        
        if (isLikedState !== isLiked()) {
          setIsLiked(isLikedState)
        }
        if (isDislikedState !== isDisliked()) {
          setIsDisliked(isDislikedState)
        }
      }
    }
  }

  // Reliable repeat state detection
  const detectRepeatState = () => {
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
            setRepeatMode(newMode)
        }
    }
  }

  // Stable handlers for shuffle/repeat state
  const handleShuffleChanged = (_: any, shuffleOn: boolean) => {
    setIsShuffle(!!shuffleOn)
  }

  const handleRepeatChanged = (_: any, repeatModeValue: number) => {
    setRepeatMode(repeatModeValue)
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

  // === SEEKING CONTROLS ===
  // Works with native progress bar and YouTube Music API
  
  const onSeekInput = (e: Event) => {
    const val = Number((e.target as HTMLInputElement).value)
    setProgress(val) // Update UI immediately for responsiveness
  }

  const onSeekStart = () => {
    setIsSeeking(true)
  }

  const onSeekEnd = (e: Event) => {
    const val = Number((e.target as HTMLInputElement).value)
    
    // Update both native progress bar and YouTube Music API
    if (nativeProgressBar) {
      (nativeProgressBar as any).value = val
    }
    
    // Use YouTube Music API for seeking if available
    if (api && typeof api.seekTo === 'function') {
      api.seekTo(val)
    } else {
      // Fallback to media element
      const mediaElement = currentMediaElement()
      if (mediaElement) {
        mediaElement.currentTime = val
      }
    }
    
    setProgress(val)
    
    // Re-enable progress sync after a brief delay
    setTimeout(() => {
      setIsSeeking(false)
    }, 100)
  }

  const onSeekChange = (e: Event) => {
    if (isSeeking()) {
      onSeekEnd(e)
    }
  }

  const onSeekKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      setIsSeeking(true)
      
      const step = 5
      const newTime = e.key === 'ArrowLeft' 
        ? Math.max(0, progress() - step)
        : Math.min(song().songDuration || 0, progress() + step)
      
      // Update native progress bar
      if (nativeProgressBar) {
        (nativeProgressBar as any).value = newTime
      }
      
      // Use YouTube Music API for seeking
      if (api && typeof api.seekTo === 'function') {
        api.seekTo(newTime)
      } else {
        // Fallback to media element
        const mediaElement = currentMediaElement()
        if (mediaElement) {
          mediaElement.currentTime = newTime
        }
      }
      
      setProgress(newTime)
      
      setTimeout(() => {
        setIsSeeking(false)
      }, 200)
    }
  }

  // === PLAYBACK CONTROLS ===
  // Enhanced to work properly with both audio and video content
  
  const playPause = () => {
    const mediaElement = currentMediaElement()
    if (!mediaElement) return
    
    if (mediaElement.paused) {
      mediaElement.play()
    } else {
      mediaElement.pause()
    }
  }

  // === OTHER CONTROLS ===
  
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

  // === CONTENT-AWARE FEATURES ===
  // Some features behave differently for audio vs video content
  
  // Picture-in-Picture: Only available for actual video content
  const togglePictureInPicture = async () => {
    const mediaElement = currentMediaElement()
    if (!mediaElement) return
    
    if (isVideoContent()) {
      // Real video content - use native PiP
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture()
        } else {
          await mediaElement.requestPictureInPicture()
        }
      } catch (err) {
        console.warn('PiP failed for video content:', err)
      }
    } else {
      // Audio-only content - use custom image PiP
      const imgSrc = song().imageSrc
      if (imgSrc) {
        await showImageInPiP(imgSrc as string)
      }
    }
  }

  // === UTILITY FUNCTIONS ===
  
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
      }
    } else {
      // Miniplayer is closed, open it
      const miniplayerBtn = document.querySelector('.player-minimize-button') as HTMLElement | null;
      if (miniplayerBtn) {
        miniplayerBtn.click();
      }
    }
  }

  // Helper: show the song image in PiP using a canvas hack for audio-only tracks
  const showImageInPiP = async (imgSrc: string) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.src = imgSrc;
    
    try {
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
      ctx.fillText('Audio-only track - Pause/play controls work in PiP', canvas.width / 2, canvas.height - 15);
      
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
      
      await video.requestPictureInPicture();
      
      // Remove the video element when PiP closes
      video.addEventListener('leavepictureinpicture', () => {
        video.pause();
        video.srcObject = null;
        video.remove();
      });
    } catch (err) {
      console.warn('Failed to create PiP for audio track:', err);
    }
  }

  const expandSongPage = () => {
    (document.querySelector('.toggle-player-page-button') as HTMLElement | null)?.click()
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      document.exitFullscreen()
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
              onInput={onVolumeInput}
              onChange={onVolumeChange}
              onMouseDown={onVolumeMouseDown}
              onTouchStart={onVolumeMouseDown}
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
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 5H4v14h7v1H3V4h16v8h-1V5ZM6 7h5v1H7.707L12 12.293l-.707.707L7 8.707V12H6V7Zm7 7h9v8h-9v-8Z" />
            </svg>
          </button>
          <button 
            class="ytmusic-menu-btn" 
            onClick={togglePictureInPicture} 
            title={isVideoContent() ? "Picture-in-Picture" : "Picture-in-Picture (Album Art)"}
          >
            <img src={pictureInPicture} alt="Picture-in-Picture" />
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