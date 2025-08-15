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
import heart from "../../../assets/svgs/Heart.svg"
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

function debounce<T extends (...args: any[]) => any>(func: T, wait: number): T {
  let timeout: number | null = null
  return ((...args: any[]) => {
    if (timeout !== null) clearTimeout(timeout)
    timeout = window.setTimeout(() => func(...args), wait)
  }) as T
}

let pluginConfig: CustomBottomBarPluginConfig
let api: YoutubePlayer

function YTMusicPlayer() {
  const [song, setSong] = createSignal(getSongInfo())
  const [artistLinks, setArtistLinks] = createSignal<Array<{ name: string; href?: string; el?: HTMLAnchorElement }>>([])
  
  const [progress, setProgress] = createSignal(0)
  let progressInputEl: HTMLInputElement | null = null
  const [isSeeking, setIsSeeking] = createSignal(false)
  
  const [currentVideoId, setCurrentVideoId] = createSignal<string | null>(null)
  const [currentMediaElement, setCurrentMediaElement] = createSignal<HTMLVideoElement | null>(null)
  
  const [isFullscreen, setIsFullscreen] = createSignal(false)
  
  let nativeProgressBar: HTMLElement | null = null
  
  const SYNC_DELAY = 300
  
  const [volume, setVolume] = createSignal(1)
  const [isMuted, setIsMuted] = createSignal(false)
  const [isDraggingVolume, setIsDraggingVolume] = createSignal(false)
  const [isLiked, setIsLiked] = createSignal(false)
  const [isDisliked, setIsDisliked] = createSignal(false)
  const [isShuffle, setIsShuffle] = createSignal(false)
  const [repeatMode, setRepeatMode] = createSignal(0)
  const [isPaused, setIsPaused] = createSignal(true)
  const [, setShowDropdown] = createSignal(false)
  const [isExpanded, setIsExpanded] = createSignal(false)
  const [displaySeconds, setDisplaySeconds] = createSignal(0)
  
  const [volumeHudVisible, setVolumeHudVisible] = createSignal(false)
  const [volumeHudText, setVolumeHudText] = createSignal("")
  let hasAppliedInitialVolume = false
  
  let nativeProgressObserver: MutationObserver | null = null
  let nativeProgressContainerObserver: MutationObserver | null = null
  let nativeVolumeObserver: MutationObserver | null = null
  let mediaListenerCleanup: (() => void)[] = []
  let lastProgressAnchor = 0
  let lastAnchorTime = 0
  let playbackRate = 1
  const ANCHOR_DRIFT_EPSILON_SECONDS = 1.0
  let rafId: number | null = null
  let lastNativeProgressUpdateAt = 0
  let failSafeInterval: number | null = null

  const clampProgressToDuration = (value: number) => {
    const duration = song().songDuration || 0
    if (duration <= 0) return 0
    return Math.max(0, Math.min(value, duration))
  }

  const getNowProgress = () => {
    const duration = song().songDuration || 0
    if (duration <= 0) return 0
    if (isPaused()) return clampProgressToDuration(progress())
    const now = performance.now()
    const deltaSec = (now - lastAnchorTime) / 1000
    return clampProgressToDuration(lastProgressAnchor + deltaSec * (playbackRate || 1))
  }

  const recomputeProgressAnimation = () => {
    const el = progressInputEl
    if (!el) return
    const duration = song().songDuration || 0
    if (duration <= 0) {
      el.style.setProperty('--progress-duration', '0s')
      el.style.setProperty('--progress-scale', '0')
      return
    }
    const current = getNowProgress()
    const scale = Math.max(0, Math.min(current / duration, 1))
    el.style.setProperty('--progress-duration', '0s')
    el.style.setProperty('--progress-scale', `${scale}`)
    el.value = String(current)
  }
  
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
    nativeProgressBar = document.querySelector('#progress-bar')
    if (!nativeProgressBar) {
      setTimeout(setupNativeProgressTracking, 1000)
      return
    }
    
    nativeProgressObserver = new MutationObserver((mutations) => {
      if (isSeeking() || isPaused()) return
      
      for (const mutation of mutations) {
        const target = mutation.target as HTMLElement & { value: string }
        if (mutation.attributeName === 'value') {
          const newValue = Number(target.value) || 0
          if (newValue >= 0 && isFinite(newValue)) {
            setProgress(newValue)
            lastNativeProgressUpdateAt = performance.now()
            const now = performance.now()
            const expected = lastProgressAnchor + ((now - lastAnchorTime) / 1000) * (playbackRate || 1)
            const drift = Math.abs(newValue - expected)
            if (drift > ANCHOR_DRIFT_EPSILON_SECONDS) {
              lastProgressAnchor = newValue
              lastAnchorTime = now
              setDisplaySeconds(Math.floor(newValue))
              recomputeProgressAnimation()
            }
          }
        }
      }
    })
    
    nativeProgressObserver.observe(nativeProgressBar, { 
      attributeFilter: ['value'] 
    })
    
    const initialValue = Number((nativeProgressBar as any).value) || 0
    setProgress(initialValue)
    lastProgressAnchor = initialValue
    lastAnchorTime = performance.now()
    lastNativeProgressUpdateAt = lastAnchorTime
    setDisplaySeconds(Math.floor(initialValue))
    recomputeProgressAnimation()

    const container = document.querySelector('ytmusic-player-bar') || document.body
    if (nativeProgressContainerObserver) {
      nativeProgressContainerObserver.disconnect()
      nativeProgressContainerObserver = null
    }
    nativeProgressContainerObserver = new MutationObserver(() => {
      const currentEl = document.querySelector('#progress-bar')
      if (!currentEl || currentEl !== nativeProgressBar) {
        nativeProgressObserver?.disconnect()
        nativeProgressObserver = null
        nativeProgressBar = currentEl as HTMLElement | null
        if (nativeProgressBar) {
          try {
            nativeProgressObserver = new MutationObserver((mutations) => {
              if (isSeeking() || isPaused()) return
              for (const mutation of mutations) {
                const target = mutation.target as HTMLElement & { value: string }
                if (mutation.attributeName === 'value') {
                  const newValue = Number(target.value) || 0
                  if (newValue >= 0 && isFinite(newValue)) {
                    setProgress(newValue)
                    lastNativeProgressUpdateAt = performance.now()
                    const now = performance.now()
                    const expected = lastProgressAnchor + ((now - lastAnchorTime) / 1000) * (playbackRate || 1)
                    const drift = Math.abs(newValue - expected)
                    if (drift > ANCHOR_DRIFT_EPSILON_SECONDS) {
                      lastProgressAnchor = newValue
                      lastAnchorTime = now
                      setDisplaySeconds(Math.floor(newValue))
                      recomputeProgressAnimation()
                    }
                  }
                }
              }
            })
            nativeProgressObserver.observe(nativeProgressBar, { attributeFilter: ['value'] })
            const v = Number((nativeProgressBar as any).value) || 0
            setProgress(v)
            lastProgressAnchor = v
            lastAnchorTime = performance.now()
            lastNativeProgressUpdateAt = lastAnchorTime
            recomputeProgressAnimation()
          } catch {}
        }
      }
    })
    nativeProgressContainerObserver.observe(container, { childList: true, subtree: true })

    if (failSafeInterval == null) {
      failSafeInterval = window.setInterval(() => {
        if (isSeeking()) return
        const now = performance.now()
        if (!isPaused() && (song().songDuration || 0) > 0 && now - lastNativeProgressUpdateAt > 3000) {
          let currentTime = NaN
          try {
            if (api && typeof api.getCurrentTime === 'function') {
              const t = api.getCurrentTime()
              if (typeof t === 'number') currentTime = t
            }
          } catch {}
          if (!isFinite(currentTime)) {
            const mediaElement = currentMediaElement()
            if (mediaElement) currentTime = mediaElement.currentTime
          }
          if (isFinite(currentTime)) {
            const clamped = clampProgressToDuration(currentTime)
            setProgress(clamped)
            lastProgressAnchor = clamped
            lastAnchorTime = performance.now()
            recomputeProgressAnimation()
            lastNativeProgressUpdateAt = performance.now()
            setDisplaySeconds(Math.floor(clamped))
          }
        }
      }, 1000)
    }
  }

  const setupNativeVolumeTracking = () => {
    const nativeVolumeSlider = document.querySelector('#volume-slider') || document.querySelector('#expand-volume-slider')
    if (!nativeVolumeSlider) {
      setTimeout(setupNativeVolumeTracking, 1000)
      return
    }
    
    nativeVolumeObserver = new MutationObserver((mutations) => {
      if (isDraggingVolume()) return
      
      for (const mutation of mutations) {
        const target = mutation.target as HTMLInputElement
        if (mutation.attributeName === 'value' || mutation.attributeName === 'aria-valuenow') {
          const newValue = Number(target.value || target.getAttribute('aria-valuenow')) || 0
          if (newValue >= 0 && newValue <= 100) {
            const newVolumeLevel = newValue / 100
            
            if (Math.abs(newVolumeLevel - volume()) > 0.01) {
              setVolume(newVolumeLevel)
              
              const shouldBeMuted = newValue === 0
              if (shouldBeMuted !== isMuted()) {
                setIsMuted(shouldBeMuted)
              }
              
              debouncedVolumeSave(newVolumeLevel)
            }
          }
        }
      }
    })
    
    const volumeSelectors = ['#volume-slider', '#expand-volume-slider']
    for (const selector of volumeSelectors) {
      const element = document.querySelector(selector)
      if (element) {
        nativeVolumeObserver.observe(element, { 
          attributeFilter: ['value', 'aria-valuenow'] 
        })
      }
    }
    
    let initialVolumeLevel = 1
    try {
      const storedVolume = localStorage.getItem(VOLUME_KEY)
      if (storedVolume !== null) {
        const stored = Number(storedVolume)
        if (stored >= 0 && stored <= 1) {
          initialVolumeLevel = stored
        }
      }
    } catch {}

    if (initialVolumeLevel === 1 && api && typeof api.getVolume === 'function') {
      const apiVolume = api.getVolume()
      if (typeof apiVolume === 'number' && apiVolume >= 0) {
        initialVolumeLevel = clamp(apiVolume / 100, 0, 1)
      }
    }

    if (initialVolumeLevel === 1) {
      const nativeValue = Number((nativeVolumeSlider as HTMLInputElement).value)
      if (nativeValue >= 0 && nativeValue <= 100) {
        initialVolumeLevel = nativeValue / 100
      }
    }

    const initialPct = volumeToPercentage(initialVolumeLevel)
    setPreciseVolume(initialPct, false)
    hasAppliedInitialVolume = true
    setIsMuted(initialVolumeLevel === 0)
  }
  
  const setupMediaListeners = (mediaElement: HTMLVideoElement) => {
    const onPlayPause = () => {
      const pausedNow = mediaElement.paused
      setIsPaused(pausedNow)
      const current = clampProgressToDuration(mediaElement.currentTime || 0)
      setProgress(current)
      lastProgressAnchor = current
      lastAnchorTime = performance.now()
      setDisplaySeconds(Math.floor(current))
      recomputeProgressAnimation()
    }
    
    const onVolumeChange = () => {
      if (!isDraggingVolume()) {
        setIsMuted(mediaElement.muted)
      }
    }
    
    const onLoadStart = () => {
      
    }
    const onRateChange = () => {
      playbackRate = mediaElement.playbackRate || 1
      lastProgressAnchor = getNowProgress()
      lastAnchorTime = performance.now()
      recomputeProgressAnimation()
    }
    const onEnded = () => {
      setIsPaused(true)
      const end = clampProgressToDuration(mediaElement.duration || song().songDuration || 0)
      setProgress(end)
      lastProgressAnchor = end
      lastAnchorTime = performance.now()
      recomputeProgressAnimation()
    }
    
    mediaElement.addEventListener('play', onPlayPause)
    mediaElement.addEventListener('pause', onPlayPause)
    mediaElement.addEventListener('loadstart', onLoadStart)
    mediaElement.addEventListener('volumechange', onVolumeChange)
    mediaElement.addEventListener('ratechange', onRateChange)
    mediaElement.addEventListener('ended', onEnded)
    
    mediaListenerCleanup.push(
      () => mediaElement.removeEventListener('play', onPlayPause),
      () => mediaElement.removeEventListener('pause', onPlayPause),
      () => mediaElement.removeEventListener('loadstart', onLoadStart),
      () => mediaElement.removeEventListener('volumechange', onVolumeChange),
      () => mediaElement.removeEventListener('ratechange', onRateChange),
      () => mediaElement.removeEventListener('ended', onEnded)
    )
    
    onPlayPause()
    setIsMuted(mediaElement.muted)
    
  }


  
  const VOLUME_KEY = "ytmusic_custombar_volume"
  const MUTE_KEY = "ytmusic_custombar_muted"
  
  const volumeToPercentage = (vol: number) => Math.round(vol * 100)
  
  const getVolumeSteps = () => {
    const steps = pluginConfig?.volumeSteps || 1
    return Math.max(1, Math.min(steps, 20))
  }
  const getArrowsShortcut = () => pluginConfig?.arrowsShortcut ?? true
  

  
  const showVolumeHud = (volumePct: number) => {
    setVolumeHudText(`${volumePct}%`)
    setVolumeHudVisible(true)
    hideVolumeHud()
  }
  
  const hideVolumeHud = debounce(() => {
    setVolumeHudVisible(false)
  }, 2000)
  
  const setPreciseVolume = (volumePct: number, showHud = true) => {
    const clampedPct = clamp(volumePct, 0, 100)
    
    setVolume(clampedPct / 100)
    
    const shouldBeMuted = clampedPct === 0
    if (shouldBeMuted !== isMuted()) {
      setIsMuted(shouldBeMuted)
    }
    
    if (api && typeof api.setVolume === "function") {
      api.setVolume(clampedPct)
    }
    
    const nativeVolumeSlider = document.querySelector('#volume-slider') as HTMLInputElement || 
                               document.querySelector('#expand-volume-slider') as HTMLInputElement
    if (nativeVolumeSlider) {
      nativeVolumeSlider.value = String(clampedPct)
      nativeVolumeSlider.dispatchEvent(new Event('input', { bubbles: true }))
    }

    if (showHud) {
      showVolumeHud(clampedPct)
    }
    
    try {
      localStorage.setItem(VOLUME_KEY, String(clampedPct / 100))
    } catch {}
  }
  
  const changeVolumeBySteps = (increase: boolean) => {
    let currentPct = volumeToPercentage(volume())
    
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
    
    setPreciseVolume(newPct, true)
  }


  
  const toggleMute = () => {
    if (api && typeof api.setVolume === "function") {
      const currentVol = api.getVolume()
      if (currentVol > 0) {
        // Mute by setting volume to 0
        api.setVolume(0)
        showVolumeHud(0)
        
        setTimeout(() => {
          const newVol = api.getVolume()
          const shouldBeMuted = newVol === 0
          setIsMuted(shouldBeMuted)
          
          try {
            localStorage.setItem(MUTE_KEY, String(shouldBeMuted))
          } catch {}
        }, 100)
      } else {
        const restoredVolume = volumeToPercentage(volume())
        const targetVolume = restoredVolume > 0 ? restoredVolume : 50
        api.setVolume(targetVolume)
        showVolumeHud(targetVolume)
        
        setTimeout(() => {
          const newVol = api.getVolume()
          const shouldBeMuted = newVol === 0
          setIsMuted(shouldBeMuted)
          
          try {
            localStorage.setItem(MUTE_KEY, String(shouldBeMuted))
          } catch {}
        }, 100)
      }
    } else {
      const mediaElement = currentMediaElement()
      if (mediaElement) {
        const newMuted = !mediaElement.muted
        mediaElement.muted = newMuted
        
        setTimeout(() => {
          const actualMuted = mediaElement.muted
          setIsMuted(actualMuted)
          
          if (actualMuted) {
            showVolumeHud(0)
          } else {
            showVolumeHud(volumeToPercentage(volume()))
          }
          
          try {
            localStorage.setItem(MUTE_KEY, String(actualMuted))
          } catch {}
        }, 100)
      }
    }
  }

  let scheduledVolumeRaf: number | null = null
  let lastScheduledVolumePct = 100
  const scheduleVolumeUpdate = (volumePct: number) => {
    lastScheduledVolumePct = clamp(Math.round(volumePct), 0, 100)
    if (scheduledVolumeRaf != null) return
    scheduledVolumeRaf = requestAnimationFrame(() => {
      scheduledVolumeRaf = null
      if (api && typeof api.setVolume === 'function') {
        try { api.setVolume(lastScheduledVolumePct) } catch {}
      }
      const nativeVolumeSlider = document.querySelector('#volume-slider') as HTMLInputElement || 
                                 document.querySelector('#expand-volume-slider') as HTMLInputElement
      if (nativeVolumeSlider) {
        nativeVolumeSlider.value = String(lastScheduledVolumePct)
        nativeVolumeSlider.dispatchEvent(new Event('input', { bubbles: true }))
      }
    })
  }

  const debouncedVolumeSave = debounce((val: number) => {
    try {
      localStorage.setItem(VOLUME_KEY, String(val))
    } catch {}
  }, 100)

  const onVolumeInput = (e: Event) => {
    const val = clamp(Number((e.target as HTMLInputElement).value), 0, 1)
    const volumePct = volumeToPercentage(val)
    
    setVolume(val)
    
    if (val === 0 && !isMuted()) {
      setIsMuted(true)
    } else if (val > 0 && isMuted()) {
      setIsMuted(false)
    }
    
    scheduleVolumeUpdate(volumePct)
    debouncedVolumeSave(val)
  }

  const onVolumeChange = (e: Event) => {
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

  const restoreMuteFromStorage = () => {
    try {
      const storedMuted = localStorage.getItem(MUTE_KEY)
      if (storedMuted !== null) {
        setIsMuted(storedMuted === "true")
      }
    } catch {}
  }

  onMount(() => {
    restoreMuteFromStorage()

    if (!pluginConfig) {
      pluginConfig = {
        enabled: true,
        volumeSteps: 1,
        arrowsShortcut: true
      }
    }


    
    setupNativeProgressTracking()
    setupNativeVolumeTracking()
    
    setTimeout(() => {
      if (hasAppliedInitialVolume) return
      try {
        const storedVolume = localStorage.getItem(VOLUME_KEY)
        if (storedVolume !== null) {
          const volumeLevel = clamp(Number(storedVolume), 0, 1)
          const volumePct = volumeToPercentage(volumeLevel)
          setPreciseVolume(volumePct, false)
          hasAppliedInitialVolume = true
        }
      } catch {}
    }, 300)
    
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
      
      findAndSetupMedia()
      
      const mediaObserver = new MutationObserver(() => {
        findAndSetupMedia()
      })
      mediaObserver.observe(document.body, { childList: true, subtree: true })
      
      return () => mediaObserver.disconnect()
    }



    const handleSongUpdate = (_: any, newSong: any) => {
      const oldVideoId = currentVideoId()
      const newVideoId = newSong.videoId
      
      setSong(newSong)
      refreshArtistLinks()
      
      if (oldVideoId !== newVideoId) {
        setCurrentVideoId(newVideoId)
        
        setTimeout(() => {
          detectLikeState()
          detectShuffleState()
          requestShuffle()
          requestRepeat()
        }, 200)
      }
      
      if (typeof newSong.isPaused === 'boolean') {
        setIsPaused(newSong.isPaused)
      }
    }

    const playPauseHandler = (_: any, data: { isPaused: boolean }) => {
      if (typeof data.isPaused === 'boolean' && data.isPaused !== isPaused()) {
        setIsPaused(data.isPaused)
      }
    }
    window.ipcRenderer.on("ytmd:play-or-paused", playPauseHandler)

    const setupScrollWheelSupport = () => {
      const mainPanel = document.querySelector('#main-panel') as HTMLElement
      if (mainPanel) {
        mainPanel.addEventListener('wheel', (event) => {
          event.preventDefault()
          changeVolumeBySteps(event.deltaY < 0)
        })
      }
      
              const playerBar = document.querySelector('ytmusic-player-bar') as HTMLElement
        if (playerBar) {
          playerBar.addEventListener('wheel', (event) => {
            event.preventDefault()
            changeVolumeBySteps(event.deltaY < 0)
          })
        }
    }

    const setupKeyboardShortcuts = () => {
      window.addEventListener('keydown', (event) => {
        if (!getArrowsShortcut()) return
        
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

    ensureSidebarExpanded()
    
    let sidebarCheckTimeout: number | null = null;
    const sidebarObserver = new MutationObserver(() => {
      if (sidebarCheckTimeout) clearTimeout(sidebarCheckTimeout);
      sidebarCheckTimeout = window.setTimeout(() => {
        ensureSidebarExpanded()
      }, 1000);
    })
    sidebarObserver.observe(document.body, { childList: true, subtree: false })

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
      
      const documentObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            const hasLikeButtonRenderer = document.querySelector('#like-button-renderer')
            
            if (hasLikeButtonRenderer) {
              detectLikeState()
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

    const handleClickOutside = (e: MouseEvent) => {
      if (
        !(e.target as Element).closest(".ytmusic-dropdown") &&
        !(e.target as Element).closest("[data-dropdown-trigger]")
      ) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("click", handleClickOutside)

    const handleGlobalMouseUp = () => {
      if (isDraggingVolume()) {
        setIsDraggingVolume(false)
      }
      if (isSeeking()) {
        setIsSeeking(false)
      }
    }
    document.addEventListener("mouseup", handleGlobalMouseUp)
    document.addEventListener("touchend", handleGlobalMouseUp)

    window.ipcRenderer.on("ytmd:shuffle-changed", handleShuffleChanged)
    window.ipcRenderer.on("ytmd:repeat-changed", handleRepeatChanged)

    const cleanupMediaTracking = setupMediaElementTracking()
    
    window.ipcRenderer.on("ytmd:update-song-info", handleSongUpdate)

    setTimeout(() => {
        requestShuffle()
        requestRepeat()
        detectShuffleState()
        detectLikeState()
    }, 1000)

    const initialVideo = document.querySelector("video") as HTMLVideoElement
    if (initialVideo) {
      setProgress(initialVideo.currentTime || 0)
      lastProgressAnchor = initialVideo.currentTime || 0
      lastAnchorTime = performance.now()
      playbackRate = initialVideo.playbackRate || 1
      setDisplaySeconds(Math.floor(initialVideo.currentTime || 0))
      recomputeProgressAnimation()
      if (!currentVideoId() && song().videoId) {
        setCurrentVideoId(song().videoId)
      }
      if (api && typeof api.setVolume === "function") {
        api.setVolume(volume() * 100)
      }
    }

    setupScrollWheelSupport()
    setupKeyboardShortcuts()

    const tick = () => {
      if (!isSeeking()) {
        recomputeProgressAnimation()
        const sec = Math.floor(getNowProgress())
        if (sec !== displaySeconds()) setDisplaySeconds(sec)
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)

    const stateInterval = setInterval(() => {
      detectShuffleState()
      detectLikeState()
    }, 5000)

    const setupControlObservers = () => {
      const shuffleBtn = document.querySelector('yt-icon-button.shuffle')
      if (shuffleBtn) {
        const shuffleObserver = new MutationObserver(() => {
          setTimeout(detectShuffleState, 100)
        })
        shuffleObserver.observe(shuffleBtn, {
          attributes: true,
          attributeFilter: ['aria-pressed', 'class', 'title', 'aria-label'],
          subtree: true
        })
        
        onCleanup(() => shuffleObserver.disconnect())
      }
    }

    setTimeout(setupControlObservers, 2000)

    onCleanup(() => {
      window.ipcRenderer.off("ytmd:update-song-info", handleSongUpdate)
      window.ipcRenderer.off("ytmd:play-or-paused", playPauseHandler)
      cleanupMediaTracking()
      cleanupMediaListeners()
      clearInterval(stateInterval)
      if (failSafeInterval != null) clearInterval(failSafeInterval)
      cleanupLikeWatcher()
      window.ipcRenderer.off("ytmd:shuffle-changed", handleShuffleChanged)
      window.ipcRenderer.off("ytmd:repeat-changed", handleRepeatChanged)
      document.removeEventListener("click", handleClickOutside)
      document.removeEventListener("mouseup", handleGlobalMouseUp)
      document.removeEventListener("touchend", handleGlobalMouseUp)
      sidebarObserver?.disconnect()
      observer?.disconnect()
      if (rafId) cancelAnimationFrame(rafId)
    })
  })

  const findSubtitleContainer = (): HTMLElement | null => {
    return (
      (document.querySelector('ytmusic-player-bar .subtitle') as HTMLElement) ||
      (document.querySelector('ytmusic-player-bar .byline') as HTMLElement) ||
      (document.querySelector('.content-info-wrapper .subtitle') as HTMLElement) ||
      (document.querySelector('.content-info-wrapper .byline') as HTMLElement) ||
      null
    )
  }

  const extractArtistAnchors = (container: HTMLElement): Array<{ name: string; href?: string; el?: HTMLAnchorElement }> => {
    const results: Array<{ name: string; href?: string; el?: HTMLAnchorElement }> = []
    let seenBullet = false
    for (const node of Array.from(container.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = (node.textContent || '').trim()
        if (text.includes('•')) {
          seenBullet = true
        }
        continue
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement
        if (el.tagName === 'A') {
          const a = el as HTMLAnchorElement
          const name = (a.textContent || '').trim()
          const href = a.getAttribute('href') || undefined
          if (!seenBullet && name) results.push({ name, href, el: a })
        }
      }
    }
    if (results.length === 0) {
      const artist = song().artist || ''
      if (artist) {
        const parts = artist.split(/\s*,\s*|\s*&\s*|\s+(?:x|×)\s+|\s*;\s*/i).filter(Boolean)
        for (const p of parts) results.push({ name: p, href: undefined, el: undefined })
      }
    }
    return results
  }

  let artistObserver: MutationObserver | null = null
  const refreshArtistLinks = () => {
    const container = findSubtitleContainer()
    if (!container) {
      setArtistLinks([])
      return
    }
    setArtistLinks(extractArtistAnchors(container))
    if (artistObserver) artistObserver.disconnect()
    artistObserver = new MutationObserver(() => {
      const c = findSubtitleContainer()
      if (c) setArtistLinks(extractArtistAnchors(c))
    })
    artistObserver.observe(container, { childList: true, subtree: true, characterData: true })
  }

  setTimeout(() => refreshArtistLinks(), 500)

  onCleanup(() => {
    artistObserver?.disconnect()
    artistObserver = null
  })

  const onArtistClick = (link: { name: string; href?: string }) => {
    const withEl = link as any as { name: string; href?: string; el?: HTMLAnchorElement }

    if (withEl.el && document.contains(withEl.el)) {
      withEl.el.click()
      return
    }

    const containers = [
      document.querySelector('ytmusic-player-bar .subtitle'),
      document.querySelector('ytmusic-player-bar .byline'),
      document.querySelector('.content-info-wrapper .subtitle'),
      document.querySelector('.content-info-wrapper .byline')
    ].filter(Boolean) as HTMLElement[]
    for (const container of containers) {
      let seenBullet = false
      for (const node of Array.from(container.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
          if ((node.textContent || '').includes('•')) seenBullet = true
          continue
        }
        if (!seenBullet && node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement
          if (el.tagName === 'A') {
            const a = el as HTMLAnchorElement
            if ((a.textContent || '').trim().toLowerCase() === (link.name || '').trim().toLowerCase()) {
              a.click()
              return
            }
          }
        }
      }
    }

    if (link.href) {
      const normalizeYtmHref = (h: string) => {
        let target = (h || '').trim()
        if (target.startsWith('https://music.youtube.com')) {
          try {
            const u = new URL(target)
            target = u.pathname + (u.search || '')
          } catch {}
        }
        if (!target.startsWith('/')) {
          if (target.startsWith('channel/') || target.startsWith('browse/') || target.startsWith('watch')) {
            target = '/' + target
          }
        }
        return target
      }
      const targetHref = normalizeYtmHref(link.href)
      const hostContainer = document.querySelector('ytmusic-player-bar .subtitle')
        || document.querySelector('ytmusic-player-bar .byline')
        || document.querySelector('.content-info-wrapper .subtitle')
        || document.querySelector('.content-info-wrapper .byline')
      const tmp = document.createElement('a')
      tmp.href = targetHref
      tmp.className = 'yt-simple-endpoint style-scope yt-formatted-string'
      tmp.setAttribute('spellcheck', 'false')
      tmp.setAttribute('dir', 'auto')
      tmp.style.display = 'inline'
      ;(hostContainer || document.body).appendChild(tmp)
      tmp.click()
      tmp.remove()
      return
    }

    const name = (link.name || '').trim()
    if (name) {
      const url = `/search?q=${encodeURIComponent(name)}`
      const tmp = document.createElement('a')
      tmp.href = url
      tmp.style.display = 'none'
      document.body.appendChild(tmp)
      tmp.click()
      document.body.removeChild(tmp)
    }
  }

  const ensureSidebarExpanded = () => {
    const miniGuide = document.querySelector('#mini-guide') as HTMLElement;
    const mainGuide = document.querySelector('ytmusic-guide-renderer') as HTMLElement;
    
    if (miniGuide && mainGuide) {
      const miniGuideVisible = window.getComputedStyle(miniGuide).display !== 'none';
      const mainGuideVisible = window.getComputedStyle(mainGuide).display !== 'none';
      
      if (miniGuideVisible && !mainGuideVisible) {
        const toggleSelectors = [
          '#button',
          'ytmusic-guide-renderer #button',
          '[aria-label*="guide" i]',
          'button[aria-label*="menu" i]',
          'ytmusic-nav-bar #button'
        ];
        
        for (const selector of toggleSelectors) {
          const toggleButton = document.querySelector(selector) as HTMLElement;
          if (toggleButton && toggleButton.offsetParent !== null) {
            toggleButton.click();
            break;
          }
        }
      }
    }
  }

  const requestShuffle = () => {
    window.ipcRenderer.send("ytmd:get-shuffle")
  }
  const requestRepeat = () => {
    window.ipcRenderer.send("ytmd:get-repeat")
  }

  const detectShuffleState = () => {
    let shuffleBtn = document.querySelector('yt-icon-button.shuffle')
    
    if (!shuffleBtn) {
      shuffleBtn = document.querySelector('button[aria-label*="Shuffle" i], button[title*="Shuffle" i]')
    }
    
    if (shuffleBtn) {
      const isActive = shuffleBtn.classList.contains('style-primary-text') || 
                      shuffleBtn.getAttribute('aria-pressed') === 'true' ||
                      shuffleBtn.querySelector('.yt-spec-icon-badge-shape__badge') !== null ||
                      getComputedStyle(shuffleBtn).color === 'rgb(255, 255, 255)'
      
      if (isActive !== isShuffle()) {
        setIsShuffle(isActive)
      }
    }
  }

  const detectLikeState = () => {
    const likeButtonRenderer = document.querySelector('#like-button-renderer')
    
    if (likeButtonRenderer) {
      let likeButton = likeButtonRenderer.querySelector('button[aria-label="Like"]')
      let dislikeButton = likeButtonRenderer.querySelector('button[aria-label="Dislike"]')
      
      if (!likeButton || !dislikeButton) {
        likeButton = likeButtonRenderer.querySelector('yt-icon-button[data-like-status] button')
        dislikeButton = likeButtonRenderer.querySelector('yt-icon-button[data-dislike-status] button')
      }
      
      if (!likeButton || !dislikeButton) {
        const buttons = likeButtonRenderer.querySelectorAll('button')
        if (buttons.length >= 2) {
          likeButton = buttons[0]
          dislikeButton = buttons[1]
        }
      }
      
      if (likeButton && dislikeButton) {
        const likeStatus = likeButtonRenderer.getAttribute('like-status')
        
        const likePressed = likeButton.getAttribute('aria-pressed') === 'true'
        const dislikePressed = dislikeButton.getAttribute('aria-pressed') === 'true'
        
        let isLikedState = false
        let isDislikedState = false
        
        if (likeStatus === 'LIKE' || likePressed) {
          isLikedState = true
          isDislikedState = false
        } else if (likeStatus === 'DISLIKE' || dislikePressed) {
          isLikedState = false
          isDislikedState = true
        } else {
          isLikedState = false
          isDislikedState = false
        }
        
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

  const handleShuffleChanged = (_: any, shuffleOn: boolean) => {
    setIsShuffle(!!shuffleOn)
  }

  const handleRepeatChanged = (_: any, repeatModeValue: number) => {
    console.log('Repeat mode changed via IPC:', repeatModeValue)
    if (typeof repeatModeValue === 'number' && repeatModeValue !== repeatMode()) {
      setRepeatMode(repeatModeValue)
    }
  }

  const fmt = (s: number) => {
    if (!isFinite(s)) return "0:00"
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
      .toString()
      .padStart(2, "0")
    return `${m}:${sec}`
  }

  const onSeekInput = (e: Event) => {
    const val = Number((e.target as HTMLInputElement).value)
    setProgress(val)
    lastProgressAnchor = val
    lastAnchorTime = performance.now()
    recomputeProgressAnimation()
  }

  const onSeekStart = () => {
    setIsSeeking(true)
  }

  const onSeekEnd = (e: Event) => {
    const val = Number((e.target as HTMLInputElement).value)
    
    if (nativeProgressBar) {
      (nativeProgressBar as any).value = val
    }
    
    if (api && typeof api.seekTo === 'function') {
      api.seekTo(val)
    } else {
      const mediaElement = currentMediaElement()
      if (mediaElement) {
        mediaElement.currentTime = val
      }
    }
    
    setProgress(val)
    lastProgressAnchor = val
    lastAnchorTime = performance.now()
      setDisplaySeconds(Math.floor(val))
    recomputeProgressAnimation()
    
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
      
      if (nativeProgressBar) {
        (nativeProgressBar as any).value = newTime
      }
      
      if (api && typeof api.seekTo === 'function') {
        api.seekTo(newTime)
      } else {
        const mediaElement = currentMediaElement()
        if (mediaElement) {
          mediaElement.currentTime = newTime
        }
      }
      
      setProgress(newTime)
      lastProgressAnchor = newTime
      lastAnchorTime = performance.now()
      setDisplaySeconds(Math.floor(newTime))
      recomputeProgressAnimation()
      
      setTimeout(() => {
        setIsSeeking(false)
      }, 200)
    }
  }

  const measureTooltipWidth = (buttonEl: HTMLElement, text: string): number => {
    const measure = document.createElement('span')
    measure.textContent = text
    measure.style.position = 'fixed'
    measure.style.left = '0'
    measure.style.top = '0'
    measure.style.visibility = 'hidden'
    measure.style.whiteSpace = 'nowrap'
    measure.style.fontSize = '12px'
    measure.style.lineHeight = '1'
    measure.style.padding = '6px 8px'
    const computed = getComputedStyle(buttonEl)
    measure.style.fontFamily = computed.fontFamily || 'inherit'
    document.body.appendChild(measure)
    const width = measure.getBoundingClientRect().width
    document.body.removeChild(measure)
    return width
  }

  const adjustTooltipPosition = (buttonEl: HTMLElement) => {
    const rect = buttonEl.getBoundingClientRect()
    const viewportWidth = window.innerWidth

    buttonEl.style.removeProperty('--tooltip-shift-x')
    buttonEl.removeAttribute('data-tooltip-pos')

    if (rect.top < 42) {
      buttonEl.setAttribute('data-tooltip-pos', 'below')
    }

    const label = buttonEl.getAttribute('data-tooltip') || buttonEl.getAttribute('aria-label') || ''
    const tooltipWidth = measureTooltipWidth(buttonEl, label)
    const halfWidth = tooltipWidth / 2
    const centerX = rect.left + rect.width / 2
    const margin = 8

    const leftEdge = centerX - halfWidth
    const rightEdge = centerX + halfWidth

    let shiftX = 0
    const leftOverflow = margin - leftEdge
    const rightOverflow = (viewportWidth - margin) - rightEdge

    if (leftOverflow > 0) {
      shiftX = leftOverflow
    } else if (rightOverflow < 0) {
      shiftX = rightOverflow
    }

    if (shiftX !== 0) {
      buttonEl.style.setProperty('--tooltip-shift-x', `${shiftX}px`)
    }
  }

  const suppressTooltip = (buttonEl: HTMLElement, durationMs: number = 600) => {
    buttonEl.setAttribute('data-tooltip-suppressed', 'true')
    window.setTimeout(() => {
      buttonEl.removeAttribute('data-tooltip-suppressed')
    }, durationMs)
  }

  const playPause = () => {
    const mediaElement = currentMediaElement()
    if (!mediaElement) return
    
    if (mediaElement.paused) {
      mediaElement.play()
    } else {
      mediaElement.pause()
    }
  }

  const next = () => {
    (document.querySelector('.next-button') as HTMLElement)?.click()
  }
  
  const prev = () => {
    (document.querySelector('.previous-button') as HTMLElement)?.click()
  }

  const toggleLike = () => {
    const likeButtonRenderer = document.querySelector('#like-button-renderer') as HTMLElement & { updateLikeStatus: (status: string) => void }
    if (likeButtonRenderer && likeButtonRenderer.updateLikeStatus) {
      likeButtonRenderer.updateLikeStatus('LIKE')
      setTimeout(detectLikeState, 100)
    } else {
      window.ipcRenderer.send("ytmd:update-like", "LIKE")
      setTimeout(detectLikeState, 100)
    }
  }

  const toggleShuffle = () => {
    const shuffleBtn = document.querySelector('yt-icon-button.shuffle button') as HTMLElement
    if (shuffleBtn) {
      shuffleBtn.click()
      
      setTimeout(() => {
        detectShuffleState()
        requestShuffle()
      }, 50)
      
      setTimeout(() => {
        detectShuffleState()
        requestShuffle()
      }, SYNC_DELAY)
    }
  }

  const toggleRepeat = () => {
    const currentMode = repeatMode()
    let nextMode = (currentMode + 1) % 3
    
    console.log(`Manual repeat toggle: ${currentMode} -> ${nextMode}`)
    
    let repeatBtn = document.querySelector('yt-icon-button.repeat button') as HTMLElement
    
    if (!repeatBtn) {
      repeatBtn = document.querySelector('yt-icon-button.repeat') as HTMLElement
      if (!repeatBtn) {
        repeatBtn = document.querySelector('button[aria-label*="repeat" i], button[aria-label*="wiederhol" i]') as HTMLElement
      }
    }
    
    if (repeatBtn) {
      let clicksNeeded = 1
      
      for (let i = 0; i < clicksNeeded; i++) {
        repeatBtn.click()
      }
      
      setRepeatMode(nextMode)
      
      console.log(`Updated repeat mode to ${nextMode}`)
    } else {
      console.log('Could not find YTM repeat button')
    }
  }

  const toggleMiniplayer = () => {
    const miniplayerBar = document.querySelector('ytmusic-player-bar[miniplayer]');
    if (miniplayerBar) {
      const closeBtn = Array.from(miniplayerBar.querySelectorAll('button')).find(btn => {
        const svg = btn.querySelector('svg');
        if (!svg) return false;
        return Array.from(svg.querySelectorAll('path')).some(path =>
          path.getAttribute('d') === 'M18 5H4v14h7v1H3V4h16v8h-1V5ZM6 7h5v1H7.707L12 12.293l-.707.707L7 8.707V12H6V7Zm7 7h9v8h-9v-8Z'
        );
      }) as HTMLElement | undefined;
      if (closeBtn) {
        closeBtn.click();
      }
    } else {
      const miniplayerBtn = document.querySelector('.player-minimize-button') as HTMLElement | null;
      if (miniplayerBtn) {
        miniplayerBtn.click();
      }
    }
  }

  const expandSongPage = () => {
    (document.querySelector('.toggle-player-page-button') as HTMLElement | null)?.click()
  }

  const navigateToAlbumPage = () => {
    const containers = [
      document.querySelector('ytmusic-player-bar .subtitle'),
      document.querySelector('ytmusic-player-bar .byline'),
      document.querySelector('.content-info-wrapper .subtitle'),
      document.querySelector('.content-info-wrapper .byline')
    ].filter(Boolean) as HTMLElement[]

    const normalizeHref = (h: string) => {
      let target = (h || '').trim()
      if (target.startsWith('https://music.youtube.com')) {
        try {
          const u = new URL(target)
          target = u.pathname + (u.search || '')
        } catch {}
      }
      if (!target.startsWith('/')) {
        if (target.startsWith('browse/') || target.startsWith('channel/') || target.startsWith('watch')) {
          target = '/' + target
        }
      }
      return target
    }

    for (const container of containers) {
      let afterBullet = false
      const candidateEls: HTMLAnchorElement[] = []
      for (const node of Array.from(container.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = (node.textContent || '')
          if (text.includes('•')) afterBullet = true
        } else if (afterBullet && node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement
          if (el.tagName === 'A') {
            const a = el as HTMLAnchorElement
            const href = normalizeHref(a.getAttribute('href') || '')
            if (href.includes('/browse/')) {
              candidateEls.push(a)
            }
          }
        }
      }
      const albumEl = candidateEls.find(a => (a.getAttribute('href') || '').includes('browse/'))
      if (albumEl) {
        albumEl.click()
        return
      }
    }

    const directAlbum = document.querySelector(
      'ytmusic-player-bar .subtitle a[href*="browse/"], ytmusic-player-bar .byline a[href*="browse/"], .content-info-wrapper .subtitle a[href*="browse/"], .content-info-wrapper .byline a[href*="browse/"]'
    ) as HTMLAnchorElement | null
    if (directAlbum) {
      const href = normalizeHref(directAlbum.getAttribute('href') || '')
      if (href.startsWith('/browse/')) {
        directAlbum.click()
        return
      }
    }

    const menuBtn = document.querySelector<HTMLElement>(
      'ytmusic-player-bar button[aria-label*="more" i], ytmusic-player-bar yt-icon-button, ytmusic-player-bar tp-yt-paper-icon-button'
    )
    if (menuBtn) {
      menuBtn.click()
      setTimeout(() => {
        const menus = document.querySelectorAll<HTMLElement>('ytmusic-menu-popup-renderer tp-yt-paper-listbox')
        for (const menu of menus) {
          const items = menu.querySelectorAll<HTMLElement>('[role="menuitem"], ytmusic-menu-navigation-item-renderer, ytmusic-toggle-menu-service-item-renderer')
          for (const item of items) {
            const text = (item.textContent || '').trim()
            if (text && /album/i.test(text) && !/artist/i.test(text)) {
              item.click()
              return
            }
          }
        }
      }, 300)
    }
  }

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  const triggerAddToPlaylist = async () => {
    const matchesPlaylistText = (text: string | null) => {
      if (!text) return false
      const t = text.toLowerCase().trim()

      const libraryWords = [
        'library',
        'mediathek',
        'bibliothek',
        'biblioteca',
      ]
      if (libraryWords.some(w => t.includes(w))) return false

      const playlistWords = [
        'playlist',
        'wiedergabeliste',
        'lista de reproducción',
        'lista de reproduccion',
        'lista de reprodução',
        'lista di riproduzione',
      ]

      const addWords = [
        'add', 'save', 'create',
        'hinzufügen', 'erstellen',
        'ajouter', 'créer',
        'agregar', 'añadir', 'crear',
        'adicionar', 'criar',
        'aggiungi', 'crea',
      ]

      if (playlistWords.some(w => t.includes(w))) return true
      if (addWords.some(v => t.includes(v)) && playlistWords.some(w => t.includes(w))) return true
      return false
    }

    const findAddToPlaylistItem = (container: HTMLElement) => {
      const excludeLikePatterns = [
        /\b(mag ich|like|gefällt mir|thumbs up)\b/i,
        /\b(mag ich nicht|dislike|gefällt mir nicht|thumbs down)\b/i,
        /\b(bewerten|rate|rating)\b/i
      ]
      
      const isLikeButton = (text: string) => {
        return excludeLikePatterns.some(pattern => pattern.test(text.toLowerCase()))
      }

      const isLibraryAction = (text: string) => {
        const t = text.toLowerCase()
        return (
          t.includes('library') ||
          t.includes('mediathek') ||
          t.includes('bibliothek') ||
          t.includes('biblioteca')
        )
      }
      
      const toggleItems = container.querySelectorAll<HTMLElement>('ytmusic-toggle-menu-service-item-renderer')
      for (let i = 0; i < toggleItems.length; i++) {
        const item = toggleItems[i]
        const hasPlaylistIcon = !!item.querySelector('yt-icon[icon*="playlist_add" i], yt-icon[icon*="playlist" i]')
        const textElement = item.querySelector<HTMLElement>('yt-formatted-string')
        const text = textElement?.textContent || ''
        
        if (isLikeButton(text) || isLibraryAction(text)) continue
        
        if (hasPlaylistIcon || (textElement && matchesPlaylistText(textElement.textContent))) {
          return item
        }
      }
      
      const navItems = container.querySelectorAll<HTMLElement>('ytmusic-menu-navigation-item-renderer')
      for (let i = 0; i < navItems.length; i++) {
        const item = navItems[i]
        const hasPlaylistIcon = !!item.querySelector('yt-icon[icon*="playlist_add" i], yt-icon[icon*="playlist" i]')
        const textElement = item.querySelector<HTMLElement>('yt-formatted-string')
        const text = textElement?.textContent || ''
        
        if (isLikeButton(text) || isLibraryAction(text)) continue
        
        if (hasPlaylistIcon || (textElement && matchesPlaylistText(textElement.textContent))) {
          return item
        }
      }
      
      const allMenuItems = container.querySelectorAll<HTMLElement>('*[role="menuitem"], ytmusic-toggle-menu-service-item-renderer, ytmusic-menu-navigation-item-renderer, ytmusic-menu-service-item-renderer')
      for (let i = 0; i < allMenuItems.length; i++) {
        const item = allMenuItems[i]
        const hasPlaylistIcon = !!item.querySelector('yt-icon[icon*="playlist_add" i], yt-icon[icon*="playlist" i]')
        const textElement = item.querySelector<HTMLElement>('yt-formatted-string') || item.querySelector<HTMLElement>('.text') || item
        const text = textElement?.textContent?.trim() || item.textContent?.trim() || ''
        const ariaLabel = item.getAttribute('aria-label') || ''
        
        if (isLikeButton(text) || isLikeButton(ariaLabel) || isLibraryAction(text) || isLibraryAction(ariaLabel)) continue
        
        if (hasPlaylistIcon || matchesPlaylistText(text) || matchesPlaylistText(ariaLabel)) {
          return item
        }
      }
      
      const allClickables = container.querySelectorAll<HTMLElement>('a, button, [role="menuitem"]')
      for (let i = 0; i < allClickables.length; i++) {
        const item = allClickables[i]
        const text = item.textContent?.trim() || ''
        const ariaLabel = item.getAttribute('aria-label') || ''
        
        if (isLikeButton(text) || isLikeButton(ariaLabel) || isLibraryAction(text) || isLibraryAction(ariaLabel)) continue
        
        if (matchesPlaylistText(text) || matchesPlaylistText(ariaLabel)) {
          return item
        }
      }
      
      return null
    }

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

    const waitForMenu = (timeout: number = 300): Promise<boolean> => {
      return new Promise((resolve) => {
        let attempts = 0
        const maxAttempts = timeout / 50
        
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

    const openContextMenu = async (): Promise<boolean> => {
      const selectors = [
        'ytmusic-player-bar button[aria-label="Aktionsmenü"]',
        'ytmusic-player-bar button[aria-label*="aktion" i]',
        'ytmusic-player-bar button[aria-label*="actions" i]',
        'ytmusic-player-bar button[aria-label*="more" i]',
        'ytmusic-player-bar button[aria-label*="menu" i]',
        'ytmusic-player-bar button[aria-label*="acciones" i]',
        'ytmusic-player-bar #icon',
        'ytmusic-player-bar tp-yt-paper-icon-button',
        'ytmusic-player-bar yt-icon-button',
        'ytmusic-player-bar yt-icon[icon="yt-icons:more_vert"]',
        'ytmusic-player-bar yt-icon[icon="yt-icons:more_horiz"]',
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

    const simulateClick = (element: HTMLElement) => {
      element.click()
      
      if (element.focus) element.focus()
      element.click()
      
      const mouseEvents = ['mouseenter', 'mouseover', 'mousedown', 'mouseup', 'click']
      for (const eventType of mouseEvents) {
        element.dispatchEvent(new MouseEvent(eventType, { 
          bubbles: true, 
          cancelable: true,
          view: window,
          detail: 1
        }))
      }
      
      const clickableChild = element.querySelector('button, a, [role="button"], [role="menuitem"]')
      if (clickableChild && clickableChild !== element) {
        ;(clickableChild as HTMLElement).click()
      }
      
      element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
      element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }))
    }

    try {
      const allMenus = document.querySelectorAll<HTMLElement>('ytmusic-menu-popup-renderer tp-yt-paper-listbox')
      
      for (const menu of allMenus) {
        const addToPlaylistItem = findAddToPlaylistItem(menu)
        if (addToPlaylistItem) {
          simulateClick(addToPlaylistItem)
          return true
        }
      }
      
      for (const menu of allMenus) {
        const expandButton = findAndClickExpandButton(menu)
        if (expandButton) {
          simulateClick(expandButton)
          
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
      
      const menuOpened = await openContextMenu()
      if (!menuOpened) {
        const allButtons = document.querySelectorAll<HTMLElement>('ytmusic-player-bar button, ytmusic-player-bar tp-yt-paper-icon-button, ytmusic-player-bar yt-icon-button, ytmusic-player-bar [role="button"], ytmusic-player-bar *[id="icon"]')
        
        for (let i = 0; i < allButtons.length; i++) {
          const button = allButtons[i]
          const ariaLabel = button.getAttribute('aria-label') || ''
          const title = button.getAttribute('title') || ''
          const textContent = button.textContent?.trim() || ''
          const id = button.getAttribute('id') || ''
          const className = button.getAttribute('class') || ''
          
          if (ariaLabel.toLowerCase().includes('more') || 
              title.toLowerCase().includes('more') || 
              ariaLabel.toLowerCase().includes('menu') ||
              title.toLowerCase().includes('menu') ||
              ariaLabel.toLowerCase().includes('option') ||
              title.toLowerCase().includes('option') ||
              ariaLabel.toLowerCase().includes('aktionsmenü') ||
              ariaLabel.toLowerCase().includes('aktion') ||
              title.toLowerCase().includes('aktionsmenü') ||
              title.toLowerCase().includes('aktion') ||
              ariaLabel.toLowerCase().includes('actions') ||
              ariaLabel.toLowerCase().includes('plus') ||
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
            }
          }
        }
        
        if (document.querySelectorAll('ytmusic-menu-popup-renderer tp-yt-paper-listbox').length === 0) {
          const allDocButtons = document.querySelectorAll<HTMLElement>('button, tp-yt-paper-icon-button, yt-icon-button, [role="button"], *[id="icon"]')
          
          for (let i = 0; i < Math.min(allDocButtons.length, 50); i++) {
            const button = allDocButtons[i]
            const ariaLabel = button.getAttribute('aria-label') || ''
            const id = button.getAttribute('id') || ''
            const className = button.getAttribute('class') || ''
            const textContent = button.textContent?.trim() || ''
            
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
              }
            }
          }
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 200))
      
      const newMenus = document.querySelectorAll<HTMLElement>('ytmusic-menu-popup-renderer tp-yt-paper-listbox')
      
      for (const menu of newMenus) {
        const addToPlaylistItem = findAddToPlaylistItem(menu)
        if (addToPlaylistItem) {
          simulateClick(addToPlaylistItem)
          return true
        }
      }
      
      for (const menu of newMenus) {
        const expandButton = findAndClickExpandButton(menu)
        if (expandButton) {
          simulateClick(expandButton)
          
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

  onMount(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    
    setIsFullscreen(!!document.fullscreenElement)

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
          <div class="ytmusic-text-block">
          <div
            class="ytmusic-title"
          >
            <span
              class="ytmusic-title-text ytmusic-link"
              title={song().title || "Song Title"}
              tabIndex={0}
              role="link"
              onClick={() => {
                navigateToAlbumPage()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  navigateToAlbumPage()
                }
              }}
            >
              {song().title || "Song Title"}
            </span>
          </div>
          <div class="ytmusic-artist-album">
            {artistLinks().length > 0 ? (
              <>
                {artistLinks().map((link, idx) => (
                  <>
                    <span
                      class="ytmusic-artist ytmusic-link"
                      title={link.name}
                      tabIndex={0}
                      role="link"
                      onClick={() => onArtistClick(link)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          onArtistClick(link)
                        }
                      }}
                    >
                      {link.name}
                    </span>
                    {idx < artistLinks().length - 1 && (
                      <span class="ytmusic-artist-sep">,</span>
                    )}
                  </>
                ))}
              </>
            ) : (
              <div
                class="ytmusic-artist ytmusic-link"
                title={song().artist || 'Artist Name'}
                tabIndex={0}
                role="link"
                onClick={() => onArtistClick({ name: song().artist || '' })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onArtistClick({ name: song().artist || '' })
                  }
                }}
              >
                {song().artist || 'Artist Name'}
              </div>
            )}
          </div>
          </div>

          <div class="ytmusic-like-section">
            <button class={`ytmusic-like-btn ${isLiked() ? "liked" : ""}`} onClick={(ev) => { ev.stopPropagation(); toggleLike(); suppressTooltip(ev.currentTarget as HTMLElement) }} aria-label="Like" data-tooltip="Like" onMouseEnter={(e) => adjustTooltipPosition(e.currentTarget as HTMLElement)}>
              <img src={heart} alt="Like" class="icon" />
            </button>
          </div>
        </div>
      </div>

      <div class="ytmusic-center">
        <div class="ytmusic-controls">
          <button class={`ytmusic-control-btn ${isShuffle() ? "active" : ""}`} onClick={(ev) => { toggleShuffle(); suppressTooltip(ev.currentTarget as HTMLElement) }} aria-label="Shuffle" data-tooltip="Shuffle" onMouseEnter={(e) => adjustTooltipPosition(e.currentTarget as HTMLElement)}>
            <img src={shuffle} alt="Shuffle" class="icon" />
          </button>

          <button class="ytmusic-nav-btn" onClick={(ev) => { prev(); suppressTooltip(ev.currentTarget as HTMLElement) }} aria-label="Previous" data-tooltip="Previous" onMouseEnter={(e) => adjustTooltipPosition(e.currentTarget as HTMLElement)}>
            <img src={skipPrevious} alt="Previous" class="icon" />
          </button>

          <button class="ytmusic-play-btn" onClick={(ev) => { playPause(); suppressTooltip(ev.currentTarget as HTMLElement) }} aria-label={isPaused() ? "Play" : "Pause"} data-tooltip={isPaused() ? "Play" : "Pause"} onMouseEnter={(e) => adjustTooltipPosition(e.currentTarget as HTMLElement)}>
            <img 
              src={isPaused() ? playArrow : pause} 
              alt={isPaused() ? "Play" : "Pause"} 
              class={isPaused() ? "play-icon icon" : "pause-icon icon"}
            />
          </button>

          <button class="ytmusic-nav-btn" onClick={(ev) => { next(); suppressTooltip(ev.currentTarget as HTMLElement) }} aria-label="Next" data-tooltip="Next" onMouseEnter={(e) => adjustTooltipPosition(e.currentTarget as HTMLElement)}>
            <img src={skipNext} alt="Next" class="icon" />
          </button>

          <button
            class={`ytmusic-control-btn ${repeatMode() > 0 ? "active" : ""}`}
            onClick={(ev) => { toggleRepeat(); suppressTooltip(ev.currentTarget as HTMLElement) }}
            aria-label={`Repeat ${repeatMode() === 0 ? 'off' : repeatMode() === 1 ? 'all' : 'one'}`}
            data-tooltip={`Repeat ${repeatMode() === 0 ? 'off' : repeatMode() === 1 ? 'all' : 'one'}`}
            onMouseEnter={(e) => adjustTooltipPosition(e.currentTarget as HTMLElement)}
            style={{ position: 'relative' }}
          >
            <img 
              src={repeatMode() === 2 ? repeatOne : repeatAll} 
              alt={repeatMode() === 0 ? "Repeat Off" : repeatMode() === 1 ? "Repeat All" : "Repeat One"} 
              class="icon"
            />
          </button>
        </div>

        <div class="ytmusic-progress">
          <span class="ytmusic-time">{fmt(displaySeconds())}</span>
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
              ref={(el) => { progressInputEl = el as HTMLInputElement; }}
            />
          </div>
          <span class="ytmusic-time">{fmt(song().songDuration || 0)}</span>
        </div>
      </div>

      <div class="ytmusic-right">
        <div class="ytmusic-volume">
          <button 
            class="ytmusic-volume-btn" 
            onClick={(ev) => { toggleMute(); suppressTooltip(ev.currentTarget as HTMLElement) }} 
            aria-label={isMuted() ? 'Unmute' : 'Mute'}
            data-tooltip={isMuted() ? 'Unmute' : 'Mute'}
            onMouseEnter={(e) => adjustTooltipPosition(e.currentTarget as HTMLElement)}
          >
            <img src={getVolumeIcon()} alt="Volume" class="icon" />
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
              style={{
                "--volume": `${(isMuted() ? 0 : volume()) * 100}%`,
              }}
            />
          </div>
        </div>

        <div class="ytmusic-additional-controls">
          <button class="ytmusic-menu-btn" onClick={async (ev) => { await triggerAddToPlaylist(); suppressTooltip(ev.currentTarget as HTMLElement) }} aria-label="Add to Playlist" data-tooltip="Add to Playlist" onMouseEnter={(e) => adjustTooltipPosition(e.currentTarget as HTMLElement)}>
            <img src={addToQueue} alt="Add to Playlist" class="icon" />
          </button>
          <button class="ytmusic-menu-btn" onClick={(ev) => { toggleMiniplayer(); suppressTooltip(ev.currentTarget as HTMLElement) }} aria-label="Toggle Miniplayer" data-tooltip="Toggle Miniplayer" onMouseEnter={(e) => adjustTooltipPosition(e.currentTarget as HTMLElement)}>
            <img src={miniplayer} alt="Toggle Miniplayer" class="icon" />
          </button>

          <button class="ytmusic-menu-btn" onClick={(ev) => { expandSongPage(); suppressTooltip(ev.currentTarget as HTMLElement) }} aria-label="Expand Song" data-tooltip="Expand Song" onMouseEnter={(e) => adjustTooltipPosition(e.currentTarget as HTMLElement)}>
            <img src={expandSong} alt="Expand Song" class="icon" />
          </button>
          <button class="ytmusic-menu-btn" onClick={(ev) => { toggleFullscreen(); suppressTooltip(ev.currentTarget as HTMLElement) }} aria-label={isFullscreen() ? "Exit Fullscreen" : "Enter Fullscreen"} data-tooltip={isFullscreen() ? "Exit Fullscreen" : "Enter Fullscreen"} onMouseEnter={(e) => adjustTooltipPosition(e.currentTarget as HTMLElement)}>
            <img src={isFullscreen() ? shrinkFullscreen : expandFullscreen} alt={isFullscreen() ? "Exit Fullscreen" : "Enter Fullscreen"} class="icon" />
          </button>
        </div>
      </div>
    </div>
  )
}

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