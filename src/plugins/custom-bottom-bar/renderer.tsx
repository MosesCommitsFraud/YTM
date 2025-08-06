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
import repeatAll from "../../../assets/svgs/icon-repeate-music.svg"
import repeatOne from "../../../assets/svgs/icon-repeate-one.svg"
import miniplayer from "../../../assets/svgs/miniplayer.svg"
import expandFullscreen from "../../../assets/svgs/Expand_fullscreen.svg"
import shrinkFullscreen from "../../../assets/svgs/Shrink_fullscreen.svg"
import expandSong from "../../../assets/svgs/expand_song.svg"
import addToQueue from "../../../assets/svgs/Add_To_Queue.svg"

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
  
  // Fullscreen state tracking
  const [isFullscreen, setIsFullscreen] = createSignal(false)
  
  // Native progress bar reference
  let nativeProgressBar: HTMLElement | null = null
  
  // Sync delay for shuffle/repeat state updates
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
  // === NATIVE ELEMENT SETUP ===
  // Setup functions defined before onMount to avoid hoisting issues
  let nativeProgressObserver: MutationObserver | null = null
  let nativeVolumeObserver: MutationObserver | null = null
  let mediaListenerCleanup: (() => void)[] = []
  
  const cleanupMediaListeners = () => {
    mediaListenerCleanup.forEach(cleanup => cleanup())
    mediaListenerCleanup = []
    if (nativeProgressObserver) {
      nativeProgressObserver.disconnect()
      nativeProgressObserver = null
    }
    if (nativeVolumeObserver) {
      nativeVolumeObserver.disconnect()
      nativeVolumeObserver = null
    }
  }
  
  const setupNativeProgressTracking = () => {
    // Find the native progress bar element
    nativeProgressBar = document.querySelector('#progress-bar')
    if (!nativeProgressBar) {
      // Retry after a delay if not found
      setTimeout(setupNativeProgressTracking, 1000)
      return
    }
    
    // Monitor native progress bar value changes
    nativeProgressObserver = new MutationObserver((mutations) => {
      if (isSeeking()) return // Don't update while user is seeking
      
      for (const mutation of mutations) {
        const target = mutation.target as HTMLElement & { value: string }
        if (mutation.attributeName === 'value') {
          const newValue = Number(target.value) || 0
          if (newValue >= 0 && isFinite(newValue)) {
            setProgress(newValue)
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
  }

  const setupNativeVolumeTracking = () => {
    // Find the native volume slider elements
    const nativeVolumeSlider = document.querySelector('#volume-slider') || document.querySelector('#expand-volume-slider')
    if (!nativeVolumeSlider) {
      // Retry after a delay if not found
      setTimeout(setupNativeVolumeTracking, 1000)
      return
    }
    
    // Monitor native volume slider value changes
    nativeVolumeObserver = new MutationObserver((mutations) => {
      if (isDraggingVolume()) return // Don't update while user is dragging custom slider
      
      for (const mutation of mutations) {
        const target = mutation.target as HTMLInputElement
        if (mutation.attributeName === 'value' || mutation.attributeName === 'aria-valuenow') {
          const newValue = Number(target.value || target.getAttribute('aria-valuenow')) || 0
          if (newValue >= 0 && newValue <= 100) {
            const newVolumeLevel = newValue / 100
            
            // Update volume state smoothly
            if (Math.abs(newVolumeLevel - volume()) > 0.01) { // Only update if significant change
              setVolume(newVolumeLevel)
              
              // Update mute state based on volume
              const shouldBeMuted = newValue === 0
              if (shouldBeMuted !== isMuted()) {
                setIsMuted(shouldBeMuted)
              }
              
              // Save to localStorage with debouncing
              debouncedVolumeSave(newVolumeLevel)
            }
          }
        }
      }
    })
    
    // Observe multiple possible volume slider elements
    const volumeSelectors = ['#volume-slider', '#expand-volume-slider']
    for (const selector of volumeSelectors) {
      const element = document.querySelector(selector)
      if (element) {
        nativeVolumeObserver.observe(element, { 
          attributeFilter: ['value', 'aria-valuenow'] 
        })
      }
    }
    
    // Initial sync from native slider, API, or localStorage
    let initialVolumeLevel = 1 // Default to 100%
    
    // Try to get from native slider first
    const nativeValue = Number((nativeVolumeSlider as HTMLInputElement).value)
    if (nativeValue >= 0 && nativeValue <= 100) {
      initialVolumeLevel = nativeValue / 100
    }
    
    // Try to get from API if available
    if (api && typeof api.getVolume === "function") {
      const apiVolume = api.getVolume()
      if (typeof apiVolume === "number" && apiVolume >= 0) {
        initialVolumeLevel = apiVolume / 100
      }
    }
    
    // Try to get from localStorage as final fallback
    try {
      const storedVolume = localStorage.getItem(VOLUME_KEY)
      if (storedVolume !== null) {
        const stored = Number(storedVolume)
        if (stored >= 0 && stored <= 1) {
          initialVolumeLevel = stored
        }
      }
    } catch {}
    
    setVolume(initialVolumeLevel)
  }
  
  const setupMediaListeners = (mediaElement: HTMLVideoElement) => {
    // Play/pause state sync
    const onPlayPause = () => {
      setIsPaused(mediaElement.paused)
    }
    
    // Mute state sync (volume level handled by native tracking)
    const onVolumeChange = () => {
      if (!isDraggingVolume()) {
        setIsMuted(mediaElement.muted)
      }
    }
    
    // Content type detection
    const onLoadStart = () => {
      
    }
    
    // Attach minimal listeners - native elements handle progress and volume tracking
    mediaElement.addEventListener('play', onPlayPause)
    mediaElement.addEventListener('pause', onPlayPause)
    mediaElement.addEventListener('loadstart', onLoadStart)
    mediaElement.addEventListener('volumechange', onVolumeChange)
    
    // Store cleanup functions
    mediaListenerCleanup.push(
      () => mediaElement.removeEventListener('play', onPlayPause),
      () => mediaElement.removeEventListener('pause', onPlayPause),
      () => mediaElement.removeEventListener('loadstart', onLoadStart),
      () => mediaElement.removeEventListener('volumechange', onVolumeChange)
    )
    
    // Initial state sync
    onPlayPause()
    setIsMuted(mediaElement.muted)
    
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
  
  // Set volume using native YouTube Music systems
  const setPreciseVolume = (volumePct: number, showHud = true) => {
    const clampedPct = clamp(volumePct, 0, 100)
    
    // Update UI state immediately for responsiveness
    setVolume(clampedPct / 100)
    
    // Update mute state based on volume
    const shouldBeMuted = clampedPct === 0
    if (shouldBeMuted !== isMuted()) {
      setIsMuted(shouldBeMuted)
    }
    
    // Use the YTM API first (more reliable)
    if (api && typeof api.setVolume === "function") {
      api.setVolume(clampedPct)
    }
    
    // Update native volume slider as backup
    const nativeVolumeSlider = document.querySelector('#volume-slider') as HTMLInputElement || 
                               document.querySelector('#expand-volume-slider') as HTMLInputElement
    if (nativeVolumeSlider) {
      nativeVolumeSlider.value = String(clampedPct)
      // Trigger change event to notify YouTube Music
      nativeVolumeSlider.dispatchEvent(new Event('input', { bubbles: true }))
    }

    if (showHud) {
      showVolumeHud(clampedPct)
    }
    
    // Save to localStorage
    try {
      localStorage.setItem(VOLUME_KEY, String(clampedPct / 100))
    } catch {}
  }
  
  // Change volume by steps (for scroll wheel and keyboard shortcuts)
  const changeVolumeBySteps = (increase: boolean) => {
    // Get current volume from the most reliable source
    let currentPct = volumeToPercentage(volume())
    
    // Try to get more accurate current volume from API if available
    if (api && typeof api.getVolume === "function") {
      const apiVolume = api.getVolume()
      if (typeof apiVolume === "number" && apiVolume >= 0) {
        currentPct = apiVolume
      }
    }
    
    const steps = getVolumeSteps()
    const newPct = increase 
      ? Math.min(currentPct + steps, 100)
      : Math.max(currentPct - steps, 0)
    
    setPreciseVolume(newPct, true) // Show HUD for scroll wheel changes
  }


  
  const toggleMute = () => {
    // Use YouTube Music API for muting
    if (api && typeof api.setVolume === "function") {
      const currentVol = api.getVolume()
      if (currentVol > 0) {
        // Mute by setting volume to 0
        api.setVolume(0)
        showVolumeHud(0)
        
        // Wait a bit for the API to apply, then confirm mute state
        setTimeout(() => {
          const newVol = api.getVolume()
          const shouldBeMuted = newVol === 0
          setIsMuted(shouldBeMuted)
          
          // Save mute state after confirmation
          try {
            localStorage.setItem(MUTE_KEY, String(shouldBeMuted))
          } catch {}
        }, 100)
      } else {
        // Unmute by restoring previous volume
        const restoredVolume = volumeToPercentage(volume())
        const targetVolume = restoredVolume > 0 ? restoredVolume : 50 // Ensure we have a reasonable volume
        api.setVolume(targetVolume)
        showVolumeHud(targetVolume)
        
        // Wait for API to apply, then confirm unmute state
        setTimeout(() => {
          const newVol = api.getVolume()
          const shouldBeMuted = newVol === 0
          setIsMuted(shouldBeMuted)
          
          // Save mute state after confirmation
          try {
            localStorage.setItem(MUTE_KEY, String(shouldBeMuted))
          } catch {}
        }, 100)
      }
    } else {
      // Fallback to media element
      const mediaElement = currentMediaElement()
      if (mediaElement) {
        const newMuted = !mediaElement.muted
        mediaElement.muted = newMuted
        
        // Wait for media element to apply the change
        setTimeout(() => {
          const actualMuted = mediaElement.muted
          setIsMuted(actualMuted)
          
          if (actualMuted) {
            showVolumeHud(0)
          } else {
            showVolumeHud(volumeToPercentage(volume()))
          }
          
          // Save mute state after confirmation
          try {
            localStorage.setItem(MUTE_KEY, String(actualMuted))
          } catch {}
        }, 100)
      }
    }
  }

  // Debounced functions for smooth volume updates
  const debouncedNativeVolumeUpdate = debounce((volumePct: number) => {
    const nativeVolumeSlider = document.querySelector('#volume-slider') as HTMLInputElement || 
                               document.querySelector('#expand-volume-slider') as HTMLInputElement
    if (nativeVolumeSlider && !isDraggingVolume()) {
      nativeVolumeSlider.value = String(volumePct)
      nativeVolumeSlider.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }, 50)

  const debouncedVolumeApiUpdate = debounce((volumePct: number) => {
    if (api && typeof api.setVolume === "function") {
      api.setVolume(volumePct)
    }
  }, 50)

  const debouncedVolumeSave = debounce((val: number) => {
    try {
      localStorage.setItem(VOLUME_KEY, String(val))
    } catch {}
  }, 200)

  const onVolumeInput = (e: Event) => {
    // Handle volume slider input (while dragging) - update volume smoothly
    const val = clamp(Number((e.target as HTMLInputElement).value), 0, 1)
    const volumePct = volumeToPercentage(val)
    
    // Update UI immediately for responsiveness
    setVolume(val)
    
    // Only set muted state if volume is actually 0
    if (val === 0 && !isMuted()) {
      setIsMuted(true)
    } else if (val > 0 && isMuted()) {
      setIsMuted(false)
    }
    
    // Debounce heavy operations for smoothness
    debouncedNativeVolumeUpdate(volumePct)
    debouncedVolumeApiUpdate(volumePct)
    debouncedVolumeSave(val)
  }

  const onVolumeChange = (e: Event) => {
    // Handle volume slider change (when dragging ends) - sync with native systems
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

  // Restore mute state from localStorage on startup
  const restoreMuteFromStorage = () => {
    try {
      const storedMuted = localStorage.getItem(MUTE_KEY)
      if (storedMuted !== null) {
        setIsMuted(storedMuted === "true")
      }
    } catch {}
  }

  onMount(() => {
    // Restore mute state from localStorage
    restoreMuteFromStorage()

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
    
    // 1. Setup native element tracking (more reliable than media element tracking)
    setupNativeProgressTracking()
    setupNativeVolumeTracking()
    
    // Ensure stored volume is applied after a delay to let YTM initialize
    setTimeout(() => {
      try {
        const storedVolume = localStorage.getItem(VOLUME_KEY)
        if (storedVolume !== null) {
          const volumeLevel = clamp(Number(storedVolume), 0, 1)
          const volumePct = volumeToPercentage(volumeLevel)
          // Only set if different from current to avoid unnecessary updates
          if (Math.abs(volumePct - volumeToPercentage(volume())) > 1) {
            setPreciseVolume(volumePct, false)
          }
        }
      } catch {}
    }, 1000)
    
    // 2. Media Element Manager - For play/pause state and content type detection
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
        
        // Sync all states for the new song
        setTimeout(() => {
          detectLikeState()
          detectShuffleState()
          requestShuffle()
          requestRepeat()
        }, 200)
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
    // Removed: setupRepeatButtonWatcher - no longer needed with simplified repeat logic
    
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
    }

    // Setup enhanced volume features
    setupScrollWheelSupport()
    setupKeyboardShortcuts()

    // General state check interval (reduced frequency since IPC is primary)
    const stateInterval = setInterval(() => {
      // Periodically check state for resilience, but rely more on IPC
      detectShuffleState()
      detectLikeState()
    }, 5000) // Check states every 5 seconds (reduced frequency)

    // Setup mutation observers for real-time state detection
    const setupControlObservers = () => {
      // Observer for shuffle button changes
      const shuffleBtn = document.querySelector('yt-icon-button.shuffle')
      if (shuffleBtn) {
        const shuffleObserver = new MutationObserver(() => {
          setTimeout(detectShuffleState, 100) // Small delay to ensure DOM is updated
        })
        shuffleObserver.observe(shuffleBtn, {
          attributes: true,
          attributeFilter: ['aria-pressed', 'class', 'title', 'aria-label'],
          subtree: true
        })
        
        // Cleanup on unmount
        onCleanup(() => shuffleObserver.disconnect())
      }

      // Removed: repeat button observer - using manual state tracking now
    }

    // Setup observers after a delay to ensure YouTube Music is fully loaded
    setTimeout(setupControlObservers, 2000)

    // Cleanup function
    onCleanup(() => {
      window.ipcRenderer.off("ytmd:update-song-info", handleSongUpdate)
      window.ipcRenderer.off("ytmd:play-or-paused", playPauseHandler)
      cleanupMediaTracking()
      cleanupMediaListeners() // Clean up media listeners and native observers
      clearInterval(stateInterval)
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

  // Enhanced shuffle state detection with multiple fallback methods
  const detectShuffleState = () => {
    // Primary method: look for the shuffle button
    let shuffleBtn = document.querySelector('yt-icon-button.shuffle')
    
    // Fallback: try different selectors
    if (!shuffleBtn) {
      shuffleBtn = document.querySelector('button[aria-label*="Shuffle" i], button[title*="Shuffle" i]')
    }
    
    if (shuffleBtn) {
      // Check multiple indicators for active state
      const isActive = shuffleBtn.classList.contains('style-primary-text') || 
                      shuffleBtn.getAttribute('aria-pressed') === 'true' ||
                      shuffleBtn.querySelector('.yt-spec-icon-badge-shape__badge') !== null ||
                      getComputedStyle(shuffleBtn).color === 'rgb(255, 255, 255)' // White text indicates active
      
      if (isActive !== isShuffle()) {
        setIsShuffle(isActive)
      }
    }
  }

  // Detect like/dislike state from YouTube Music
  const detectLikeState = () => {
    const likeButtonRenderer = document.querySelector('#like-button-renderer')
    
    if (likeButtonRenderer) {
      // Try multiple selector approaches since YouTube Music structure can vary
      let likeButton = likeButtonRenderer.querySelector('button[aria-label="Like"]')
      let dislikeButton = likeButtonRenderer.querySelector('button[aria-label="Dislike"]')
      
      // Fallback selectors if aria-label approach doesn't work
      if (!likeButton || !dislikeButton) {
        likeButton = likeButtonRenderer.querySelector('yt-icon-button[data-like-status] button')
        dislikeButton = likeButtonRenderer.querySelector('yt-icon-button[data-dislike-status] button')
      }
      
      // Try even more generic approach
      if (!likeButton || !dislikeButton) {
        const buttons = likeButtonRenderer.querySelectorAll('button')
        if (buttons.length >= 2) {
          likeButton = buttons[0] // First button is usually like
          dislikeButton = buttons[1] // Second button is usually dislike
        }
      }
      
      if (likeButton && dislikeButton) {
        // Get the parent renderer's like-status attribute (this is the master state)
        const likeStatus = likeButtonRenderer.getAttribute('like-status')
        
        // Check button-specific pressed states
        const likePressed = likeButton.getAttribute('aria-pressed') === 'true'
        const dislikePressed = dislikeButton.getAttribute('aria-pressed') === 'true'
        
        // Determine states - they should be mutually exclusive
        let isLikedState = false
        let isDislikedState = false
        
        if (likeStatus === 'LIKE' || likePressed) {
          isLikedState = true
          isDislikedState = false // Mutually exclusive
        } else if (likeStatus === 'DISLIKE' || dislikePressed) {
          isLikedState = false // Mutually exclusive  
          isDislikedState = true
        } else {
          // Neutral state - neither liked nor disliked
          isLikedState = false
          isDislikedState = false
        }
        

        
        // Update states only if they changed
        if (isLikedState !== isLiked()) {
          setIsLiked(isLikedState)
        }
        if (isDislikedState !== isDisliked()) {
          setIsDisliked(isDislikedState)
        }
      } else {

      }
    } else {

    }
  }

  // Manual repeat state tracking - ignore YouTube Music's UI state
  // We'll track our own state and just use YTM's button for the actual functionality

  // Stable handlers for shuffle/repeat state
  const handleShuffleChanged = (_: any, shuffleOn: boolean) => {
    setIsShuffle(!!shuffleOn)
  }

  const handleRepeatChanged = (_: any, repeatModeValue: number) => {
    console.log('Repeat mode changed via IPC:', repeatModeValue)
    // IPC should be the authoritative source for repeat state
    if (typeof repeatModeValue === 'number' && repeatModeValue !== repeatMode()) {
      setRepeatMode(repeatModeValue)
    }
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
    // Click the original YouTube Music shuffle button
    const shuffleBtn = document.querySelector('yt-icon-button.shuffle button') as HTMLElement
    if (shuffleBtn) {
      shuffleBtn.click()
      
      // Immediate state update with multiple checks for responsiveness
      setTimeout(() => {
        detectShuffleState()
        requestShuffle()
      }, 50)
      
      // Additional check after standard delay
      setTimeout(() => {
        detectShuffleState()
        requestShuffle()
      }, SYNC_DELAY)
    }
  }

  const toggleRepeat = () => {
    // Manual state cycling: 0 -> 1 -> 2 -> 0  
    const currentMode = repeatMode()
    let nextMode = (currentMode + 1) % 3 // Cycle through 0, 1, 2
    
    console.log(`Manual repeat toggle: ${currentMode} -> ${nextMode}`)
    
    // Find the native YouTube Music repeat button
    let repeatBtn = document.querySelector('yt-icon-button.repeat button') as HTMLElement
    
    if (!repeatBtn) {
      // Fallback selectors
      repeatBtn = document.querySelector('yt-icon-button.repeat') as HTMLElement
      if (!repeatBtn) {
        repeatBtn = document.querySelector('button[aria-label*="repeat" i], button[aria-label*="wiederhol" i]') as HTMLElement
      }
    }
    
    if (repeatBtn) {
      // Click the native button to make YouTube Music do the actual repeat behavior
      // The number of clicks needed depends on current state and target state
      let clicksNeeded = 1
      
      // For now, just click once and let YouTube Music cycle
      // (YouTube Music cycles: off -> repeat all -> repeat one -> off)
      for (let i = 0; i < clicksNeeded; i++) {
        repeatBtn.click()
      }
      
      // Update our state immediately
      setRepeatMode(nextMode)
      
      console.log(`Updated repeat mode to ${nextMode}`)
    } else {
      console.log('Could not find YTM repeat button')
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

  const triggerAddToPlaylist = async () => {
    // Enhanced text matching function with better internationalization support
    const matchesPlaylistText = (text: string | null) => {
      if (!text) return false
      const normalizedText = text.toLowerCase().trim()
      
      const patterns = [
        // English variations - specific playlist terms
        /\b(add to playlist|save to playlist|add to library|save to library)\b/,
        /\b(library|playlist)\b.*\b(add|save)\b/,
        /\b(add|save)\b.*\b(library|playlist)\b/,
        
        // German variations - SPECIFIC playlist/library terms only (avoid generic "speichern")
        /\b(zur mediathek hinzufügen|in mediathek speichern)\b/,
        /\b(zu playlist hinzufügen|zur playlist hinzufügen|zur wiedergabeliste hinzufügen)\b/,
        /\b(wiedergabeliste erstellen|playlist erstellen)\b/,
        /\bwiedergabeliste\b.*\b(hinzufügen|erstellen)\b/,
        /\bplaylist\b.*\b(hinzufügen|erstellen)\b/,
        /\bmediathek\b.*\b(hinzufügen)\b/, // Only "hinzufügen" with mediathek, not generic "speichern"
        
        // French variations
        /\b(ajouter à la playlist|enregistrer dans la bibliothèque)\b/,
        /\b(créer une playlist|ajouter à une playlist)\b/,
        
        // Spanish variations
        /\b(agregar a playlist|guardar en biblioteca)\b/,
        /\b(crear playlist|añadir a playlist)\b/,
        
        // Icon-based detection patterns
        /library_add|playlist_add/,
        
        // More specific patterns - must include playlist/library context
        /\bto playlist\b/,
        /\bto library\b/,
        /\bzur playlist\b/,
        /\bzur mediathek\b/,
        /\bin mediathek\b/,
        
        // SPECIFIC playlist-related terms only (removed generic save/add)
        /\bplaylist\b/,
        /\blibrary\b/,
        /\bmediathek\b/,
        /\bwiedergabeliste\b/,
        /\bbibliothek\b/,
        
        // Only allow these generic terms if they appear with playlist context
        /\b(hinzufügen|erstellen)\b.*\b(playlist|wiedergabeliste|mediathek)\b/,
        /\b(add|create)\b.*\b(playlist|library)\b/
      ]
      
      return patterns.some(pattern => pattern.test(normalizedText))
    }

    // Enhanced helper function to find add to playlist item with better detection
    const findAddToPlaylistItem = (container: HTMLElement) => {
      // First, exclude like/dislike buttons by checking for common like patterns
      const excludeLikePatterns = [
        /\b(mag ich|like|gefällt mir|thumbs up)\b/i,
        /\b(mag ich nicht|dislike|gefällt mir nicht|thumbs down)\b/i,
        /\b(bewerten|rate|rating)\b/i
      ]
      
      const isLikeButton = (text: string) => {
        return excludeLikePatterns.some(pattern => pattern.test(text.toLowerCase()))
      }
      
      // Check toggle service items first (most reliable for playlist actions)
      const toggleItems = container.querySelectorAll<HTMLElement>('ytmusic-toggle-menu-service-item-renderer')
      for (let i = 0; i < toggleItems.length; i++) {
        const item = toggleItems[i]
        const textElement = item.querySelector<HTMLElement>('yt-formatted-string')
        const text = textElement?.textContent || ''
        
        // Skip if this looks like a like/dislike button
        if (isLikeButton(text)) continue
        
        if (textElement && matchesPlaylistText(textElement.textContent)) {
          return item
        }
      }
      
      // Fallback to navigation items
      const navItems = container.querySelectorAll<HTMLElement>('ytmusic-menu-navigation-item-renderer')
      for (let i = 0; i < navItems.length; i++) {
        const item = navItems[i]
        const textElement = item.querySelector<HTMLElement>('yt-formatted-string')
        const text = textElement?.textContent || ''
        
        // Skip if this looks like a like/dislike button
        if (isLikeButton(text)) continue
        
        if (textElement && matchesPlaylistText(textElement.textContent)) {
          return item
        }
      }
      
      // Check all menu items regardless of type
      const allMenuItems = container.querySelectorAll<HTMLElement>('*[role="menuitem"], ytmusic-toggle-menu-service-item-renderer, ytmusic-menu-navigation-item-renderer, ytmusic-menu-service-item-renderer')
      for (let i = 0; i < allMenuItems.length; i++) {
        const item = allMenuItems[i]
        const textElement = item.querySelector<HTMLElement>('yt-formatted-string') || item.querySelector<HTMLElement>('.text') || item
        const text = textElement?.textContent?.trim() || item.textContent?.trim() || ''
        const ariaLabel = item.getAttribute('aria-label') || ''
        
        // Skip if this looks like a like/dislike button
        if (isLikeButton(text) || isLikeButton(ariaLabel)) continue
        
        if (matchesPlaylistText(text) || matchesPlaylistText(ariaLabel)) {
          return item
        }
      }
      
      // Last resort: check any clickable elements with matching text or aria-label
      const allClickables = container.querySelectorAll<HTMLElement>('a, button, [role="menuitem"]')
      for (let i = 0; i < allClickables.length; i++) {
        const item = allClickables[i]
        const text = item.textContent?.trim() || ''
        const ariaLabel = item.getAttribute('aria-label') || ''
        
        // Skip if this looks like a like/dislike button
        if (isLikeButton(text) || isLikeButton(ariaLabel)) continue
        
        if (matchesPlaylistText(text) || matchesPlaylistText(ariaLabel)) {
          return item
        }
      }
      
      return null
    }

    // Enhanced expand button detection
    const findAndClickExpandButton = (container: HTMLElement) => {
      const menuItems = container.querySelectorAll<HTMLElement>('ytmusic-menu-navigation-item-renderer')
      
      for (const item of menuItems) {
        const textElement = item.querySelector<HTMLElement>('yt-formatted-string')
        if (textElement && matchesPlaylistText(textElement.textContent)) {
          return item
        }
      }
      return null
    }

    // Helper function to wait for menu to appear
    const waitForMenu = (timeout: number = 300): Promise<boolean> => {
      return new Promise((resolve) => {
        let attempts = 0
        const maxAttempts = timeout / 50 // Check every 50ms
        
        const checkMenu = () => {
          const menu = document.querySelector('ytmusic-menu-popup-renderer tp-yt-paper-listbox')
          if (menu) {
            resolve(true)
          } else if (attempts < maxAttempts) {
            attempts++
            setTimeout(checkMenu, 50)
          } else {
            resolve(false)
          }
        }
        
        checkMenu()
      })
    }

    // Enhanced menu opening with correct selectors based on working examples
    const openContextMenu = async (): Promise<boolean> => {
      // Try the selectors that actually work in YT Music, based on other successful plugins
      const selectors = [
        // Direct selector for the German "Aktionsmenü" button we found
        'ytmusic-player-bar button[aria-label="Aktionsmenü"]',
        // Generic multilingual selectors
        'ytmusic-player-bar button[aria-label*="aktion" i]',
        'ytmusic-player-bar button[aria-label*="actions" i]',
        'ytmusic-player-bar button[aria-label*="more" i]',
        'ytmusic-player-bar button[aria-label*="menu" i]',
        'ytmusic-player-bar button[aria-label*="acciones" i]',
        // The #icon selector is used successfully in picture-in-picture plugin
        'ytmusic-player-bar #icon',
        // Try variations of the more button that might exist
        'ytmusic-player-bar tp-yt-paper-icon-button',
        'ytmusic-player-bar yt-icon-button',
        // More specific icon-based selectors
        'ytmusic-player-bar yt-icon[icon="yt-icons:more_vert"]',
        'ytmusic-player-bar yt-icon[icon="yt-icons:more_horiz"]',
        // Fallback generic selectors
        'ytmusic-player-bar [role="button"]',
        'ytmusic-player-bar .more-button'
      ]
      
      for (const selector of selectors) {
        const button = document.querySelector<HTMLElement>(selector)
        if (button && button.offsetParent !== null) { // Check visibility
          button.click()
          const menuOpened = await waitForMenu(300)
          if (menuOpened) {
            return true
          }
        }
      }
      
      return false
    }

    // Enhanced click handling with comprehensive event simulation
    const simulateClick = (element: HTMLElement) => {
      // Try multiple click approaches for maximum compatibility
      
      // 1. Standard click
      element.click()
      
      // 2. Focus first, then click (some elements need focus)
      if (element.focus) element.focus()
      element.click()
      
      // 3. Comprehensive mouse event simulation
      const mouseEvents = ['mouseenter', 'mouseover', 'mousedown', 'mouseup', 'click']
      for (const eventType of mouseEvents) {
        element.dispatchEvent(new MouseEvent(eventType, { 
          bubbles: true, 
          cancelable: true,
          view: window,
          detail: 1
        }))
      }
      
      // 4. Try triggering on child elements if they exist
      const clickableChild = element.querySelector('button, a, [role="button"], [role="menuitem"]')
      if (clickableChild && clickableChild !== element) {
        ;(clickableChild as HTMLElement).click()
      }
      
      // 5. Try pointer events (newer standard)
      element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
      element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }))
    }

    try {
      // First, try to find and click in any existing open menu
      const allMenus = document.querySelectorAll<HTMLElement>('ytmusic-menu-popup-renderer tp-yt-paper-listbox')
      
      for (const menu of allMenus) {
        const addToPlaylistItem = findAddToPlaylistItem(menu)
        if (addToPlaylistItem) {
          simulateClick(addToPlaylistItem)
          return true
        }
      }
      
      // If no direct item found in existing menus, try expand button approach
      for (const menu of allMenus) {
        const expandButton = findAndClickExpandButton(menu)
        if (expandButton) {
          simulateClick(expandButton)
          
          // Wait for expanded menu to appear
          await new Promise(resolve => setTimeout(resolve, 200))
          
          const allMenusAfterExpand = document.querySelectorAll<HTMLElement>('ytmusic-menu-popup-renderer tp-yt-paper-listbox')
          for (const menuAfterExpand of allMenusAfterExpand) {
            const addToPlaylistItem = findAddToPlaylistItem(menuAfterExpand)
            if (addToPlaylistItem) {
              simulateClick(addToPlaylistItem)
              return true
            }
          }
        }
      }
      
      // If no menu is open, try to open the context menu first
      const menuOpened = await openContextMenu()
      if (!menuOpened) {
        // Fallback: Try alternative approach with direct button search
        const allButtons = document.querySelectorAll<HTMLElement>('ytmusic-player-bar button, ytmusic-player-bar tp-yt-paper-icon-button, ytmusic-player-bar yt-icon-button, ytmusic-player-bar [role="button"], ytmusic-player-bar *[id="icon"]')
        
        for (let i = 0; i < allButtons.length; i++) {
          const button = allButtons[i]
          const ariaLabel = button.getAttribute('aria-label') || ''
          const title = button.getAttribute('title') || ''
          const textContent = button.textContent?.trim() || ''
          const id = button.getAttribute('id') || ''
          const className = button.getAttribute('class') || ''
          
          // Try more liberal matching for menu buttons (with multilingual support)
          if (ariaLabel.toLowerCase().includes('more') || 
              title.toLowerCase().includes('more') || 
              ariaLabel.toLowerCase().includes('menu') ||
              title.toLowerCase().includes('menu') ||
              ariaLabel.toLowerCase().includes('option') ||
              title.toLowerCase().includes('option') ||
              // German language support
              ariaLabel.toLowerCase().includes('aktionsmenü') ||
              ariaLabel.toLowerCase().includes('aktion') ||
              title.toLowerCase().includes('aktionsmenü') ||
              title.toLowerCase().includes('aktion') ||
              // French language support
              ariaLabel.toLowerCase().includes('actions') ||
              ariaLabel.toLowerCase().includes('plus') ||
              // Spanish language support
              ariaLabel.toLowerCase().includes('acciones') ||
              ariaLabel.toLowerCase().includes('más') ||
              id === 'icon' ||
              className.includes('more') ||
              textContent.includes('⋮') || 
              textContent.includes('⋯') || 
              textContent.includes('•••')) { 
            
            try {
              button.click()
              const menuOpened = await waitForMenu(500)
              if (menuOpened) {
                break
              }
            } catch (err) {
              // Continue to next button
            }
          }
        }
        
        // If still no menu found, try searching the entire document for menu buttons
        if (document.querySelectorAll('ytmusic-menu-popup-renderer tp-yt-paper-listbox').length === 0) {
          const allDocButtons = document.querySelectorAll<HTMLElement>('button, tp-yt-paper-icon-button, yt-icon-button, [role="button"], *[id="icon"]')
          
          for (let i = 0; i < Math.min(allDocButtons.length, 50); i++) { // Limit to first 50 to avoid spam
            const button = allDocButtons[i]
            const ariaLabel = button.getAttribute('aria-label') || ''
            const id = button.getAttribute('id') || ''
            const className = button.getAttribute('class') || ''
            const textContent = button.textContent?.trim() || ''
            
            // Look for buttons that might open the song menu
            if ((ariaLabel.toLowerCase().includes('more') && 
                 (button.closest('ytmusic-player-bar') || button.closest('ytmusic-player'))) ||
                (id === 'icon' && button.closest('ytmusic-player-bar')) ||
                (className.includes('more') && button.closest('ytmusic-player-bar')) ||
                textContent.includes('⋮') || textContent.includes('⋯')) {
              
              try {
                button.click()
                const menuOpened = await waitForMenu(500)
                if (menuOpened) {
                  break
                }
              } catch (err) {
                // Continue to next button
              }
            }
          }
        }
      }
      
      // Wait a bit more for menu to fully load
      await new Promise(resolve => setTimeout(resolve, 200))
      
      const newMenus = document.querySelectorAll<HTMLElement>('ytmusic-menu-popup-renderer tp-yt-paper-listbox')
      
      // First try to find direct add to playlist item
      for (const menu of newMenus) {
        const addToPlaylistItem = findAddToPlaylistItem(menu)
        if (addToPlaylistItem) {
          simulateClick(addToPlaylistItem)
          return true
        }
      }
      
      // If not found, try expand button approach
      for (const menu of newMenus) {
        const expandButton = findAndClickExpandButton(menu)
        if (expandButton) {
          simulateClick(expandButton)
          
          // Wait for expanded menu
          await new Promise(resolve => setTimeout(resolve, 200))
          
          const allMenusAfterExpand = document.querySelectorAll<HTMLElement>('ytmusic-menu-popup-renderer tp-yt-paper-listbox')
          for (const menuAfterExpand of allMenusAfterExpand) {
            const addToPlaylistItem = findAddToPlaylistItem(menuAfterExpand)
            if (addToPlaylistItem) {
              simulateClick(addToPlaylistItem)
              return true
            }
          }
        }
      }
      
      return false
      
    } catch (error) {
      return false
    }
  }

  // Setup fullscreen change listener
  onMount(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    
    // Initialize the state
    setIsFullscreen(!!document.fullscreenElement)

    // Cleanup
    onCleanup(() => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    })
  })

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
            <img 
              src={isPaused() ? playArrow : pause} 
              alt={isPaused() ? "Play" : "Pause"} 
              class={isPaused() ? "play-icon" : "pause-icon"}
            />
          </button>

          <button class="ytmusic-nav-btn" onClick={next} title="Next">
            <img src={skipNext} alt="Next" />
          </button>

          {/* CORRECTED: Visual logic for repeat button with distinct states */}
          <button
            class={`ytmusic-control-btn ${repeatMode() > 0 ? "active" : ""}`}
            onClick={toggleRepeat}
            title={`Repeat ${repeatMode() === 0 ? 'off' : repeatMode() === 1 ? 'all' : 'one'} (Mode: ${repeatMode()}) • Click to cycle modes • Volume: ${volumeToPercentage(volume())}% (±${getVolumeSteps()}% steps)`}
            style={{ position: 'relative' }}
          >
            <img 
              src={repeatMode() === 2 ? repeatOne : repeatAll} 
              alt={repeatMode() === 0 ? "Repeat Off" : repeatMode() === 1 ? "Repeat All" : "Repeat One"} 
            />
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
          <button class="ytmusic-menu-btn" onClick={triggerAddToPlaylist} title="Add to Playlist">
            <img src={addToQueue} alt="Add to Playlist" />
          </button>
          <button class="ytmusic-menu-btn" onClick={toggleMiniplayer} title="Toggle Miniplayer">
            <img src={miniplayer} alt="Toggle Miniplayer" />
          </button>

          <button class="ytmusic-menu-btn" onClick={expandSongPage} title="Expand Song">
            <img src={expandSong} alt="Expand Song" />
          </button>
          <button class="ytmusic-menu-btn" onClick={toggleFullscreen} title={isFullscreen() ? "Exit Fullscreen" : "Enter Fullscreen"}>
            <img src={isFullscreen() ? shrinkFullscreen : expandFullscreen} alt={isFullscreen() ? "Exit Fullscreen" : "Enter Fullscreen"} />
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