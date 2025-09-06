import { startingPages } from './providers/extracted-data';
import setupSongInfo from './providers/song-info-front';
import {
  createContext,
  forceLoadRendererPlugin,
  forceUnloadRendererPlugin,
  getAllLoadedRendererPlugins,
  getLoadedRendererPlugin,
  loadAllRendererPlugins,
} from './loader/renderer';

import {
  defaultTrustedTypePolicy,
  registerWindowDefaultTrustedTypePolicy,
} from '@/utils/trusted-types';

import type { PluginConfig } from '@/types/plugins';
import type { YoutubePlayer } from '@/types/youtube-player';
import type { QueueElement } from '@/types/queue';
import type { QueueResponse } from '@/types/youtube-music-desktop-internal';
import type { YouTubeMusicAppElement } from '@/types/youtube-music-app-element';
import type { SearchBoxElement } from '@/types/search-box-element';
import { showOverlaySearch } from './overlay-search';

let api: (Element & YoutubePlayer) | null = null;
let isPluginLoaded = false;
let isApiLoaded = false;
let firstDataLoaded = false;

registerWindowDefaultTrustedTypePolicy();

// Setup update progress notifications
let updateNotification: Notification | null = null;

window.ipcRenderer.on('download-progress', (_, progressObj: { percent: number, bytesPerSecond: number, transferred: number, total: number }) => {
  const { percent, bytesPerSecond, transferred, total } = progressObj;
  
  // Show or update notification
  if (updateNotification) {
    updateNotification.close();
  }
  
  const speedMB = (bytesPerSecond / (1024 * 1024)).toFixed(1);
  const transferredMB = (transferred / (1024 * 1024)).toFixed(1);
  const totalMB = (total / (1024 * 1024)).toFixed(1);
  
  updateNotification = new Notification('Downloading Update', {
    body: `Progress: ${percent.toFixed(1)}% (${transferredMB}/${totalMB} MB)\nSpeed: ${speedMB} MB/s`,
    icon: 'assets/youtube-music.png',
    silent: true,
  });
  
  // Auto-close notification after 3 seconds
  setTimeout(() => {
    if (updateNotification) {
      updateNotification.close();
      updateNotification = null;
    }
  }, 3000);
});

async function listenForApiLoad() {
  if (!isApiLoaded) {
    api = document.querySelector('#movie_player');
    if (api) {
      await onApiLoaded();

      return;
    }
  }
}

async function onApiLoaded() {
  // Workaround for macOS traffic lights
  {
    let osType = 'Unknown';
    if (window.electronIs.osx()) {
      osType = 'Macintosh';
    } else if (window.electronIs.windows()) {
      osType = 'Windows';
    } else if (window.electronIs.linux()) {
      osType = 'Linux';
    }
    document.documentElement.setAttribute('data-os', osType);
  }

  // Workaround for #2459
  document
    .querySelector('button.video-button.ytmusic-av-toggle')
    ?.addEventListener('click', () =>
      window.dispatchEvent(new Event('resize')),
    );

  window.ipcRenderer.on('ytmd:previous-video', () => {
    document
      .querySelector<HTMLElement>('.previous-button.ytmusic-player-bar')
      ?.click();
  });
  window.ipcRenderer.on('ytmd:next-video', () => {
    document
      .querySelector<HTMLElement>('.next-button.ytmusic-player-bar')
      ?.click();
  });
  window.ipcRenderer.on('ytmd:play', (_) => {
    api?.playVideo();
  });
  window.ipcRenderer.on('ytmd:pause', (_) => {
    api?.pauseVideo();
  });
  window.ipcRenderer.on('ytmd:toggle-play', (_) => {
    if (api?.getPlayerState() === 2) api?.playVideo();
    else api?.pauseVideo();
  });
  window.ipcRenderer.on('ytmd:seek-to', (_, t: number) => api!.seekTo(t));
  window.ipcRenderer.on('ytmd:seek-by', (_, t: number) => api!.seekBy(t));
  window.ipcRenderer.on('ytmd:shuffle', () => {
    document
      .querySelector<
        HTMLElement & { queue: { shuffle: () => void } }
      >('ytmusic-player-bar')
      ?.queue.shuffle();
  });

  const isShuffled = () => {
    const isShuffled =
      document
        .querySelector<HTMLElement>('ytmusic-player-bar')
        ?.attributes.getNamedItem('shuffle-on') ?? null;

    return isShuffled !== null;
  };

  window.ipcRenderer.on('ytmd:get-shuffle', () => {
    window.ipcRenderer.send('ytmd:get-shuffle-response', isShuffled());
  });

  window.ipcRenderer.on(
    'ytmd:update-like',
    (_, status: 'LIKE' | 'DISLIKE' = 'LIKE') => {
      document
        .querySelector<
          HTMLElement & { updateLikeStatus: (status: string) => void }
        >('#like-button-renderer')
        ?.updateLikeStatus(status);
    },
  );
  window.ipcRenderer.on('ytmd:switch-repeat', (_, repeat = 1) => {
    for (let i = 0; i < repeat; i++) {
      document
        .querySelector<
          HTMLElement & { onRepeatButtonClick: () => void }
        >('ytmusic-player-bar')
        ?.onRepeatButtonClick();
    }
  });
  window.ipcRenderer.on('ytmd:update-volume', (_, volume: number) => {
    document
      .querySelector<
        HTMLElement & { updateVolume: (volume: number) => void }
      >('ytmusic-player-bar')
      ?.updateVolume(volume);
  });

  const isFullscreen = () => {
    const isFullscreen =
      document
        .querySelector<HTMLElement>('ytmusic-player-bar')
        ?.attributes.getNamedItem('player-fullscreened') ?? null;

    return isFullscreen !== null;
  };

  const clickFullscreenButton = (isFullscreenValue: boolean) => {
    const fullscreen = isFullscreen();
    if (isFullscreenValue === fullscreen) {
      return;
    }

    if (fullscreen) {
      document.querySelector<HTMLElement>('.exit-fullscreen-button')?.click();
    } else {
      document.querySelector<HTMLElement>('.fullscreen-button')?.click();
    }
  };

  window.ipcRenderer.on('ytmd:get-fullscreen', () => {
    window.ipcRenderer.send('ytmd:set-fullscreen', isFullscreen());
  });

  window.ipcRenderer.on(
    'ytmd:click-fullscreen-button',
    (_, fullscreen: boolean | undefined) => {
      clickFullscreenButton(fullscreen ?? false);
    },
  );

  window.ipcRenderer.on('ytmd:toggle-mute', (_) => {
    document
      .querySelector<
        HTMLElement & { onVolumeClick: () => void }
      >('ytmusic-player-bar')
      ?.onVolumeClick();
  });

  window.ipcRenderer.on('ytmd:get-queue', () => {
    const queue = document.querySelector<QueueElement>('#queue');
    window.ipcRenderer.send('ytmd:get-queue-response', {
      items: queue?.queue.getItems(),
      autoPlaying: queue?.queue.autoPlaying,
      continuation: queue?.queue.continuation,
    } satisfies QueueResponse);
  });

  window.ipcRenderer.on(
    'ytmd:add-to-queue',
    (_, videoId: string, queueInsertPosition: string) => {
      const queue = document.querySelector<QueueElement>('#queue');
      const app = document.querySelector<YouTubeMusicAppElement>('ytmusic-app');
      if (!app) return;

      const store = queue?.queue.store.store;
      if (!store) return;

      app.networkManager
        .fetch('/music/get_queue', {
          queueContextParams: store.getState().queue.queueContextParams,
          queueInsertPosition,
          videoIds: [videoId],
        })
        .then((result) => {
          if (
            result &&
            typeof result === 'object' &&
            'queueDatas' in result &&
            Array.isArray(result.queueDatas)
          ) {
            const queueItems = store.getState().queue.items;
            const queueItemsLength = queueItems.length ?? 0;
            queue?.dispatch({
              type: 'ADD_ITEMS',
              payload: {
                nextQueueItemId: store.getState().queue.nextQueueItemId,
                index:
                  queueInsertPosition === 'INSERT_AFTER_CURRENT_VIDEO'
                    ? queueItems.findIndex(
                        (it) =>
                          (
                            it.playlistPanelVideoRenderer ||
                            it.playlistPanelVideoWrapperRenderer
                              ?.primaryRenderer.playlistPanelVideoRenderer
                          )?.selected,
                      ) + 1 || queueItemsLength
                    : queueItemsLength,
                items: result.queueDatas
                  .map((it) =>
                    typeof it === 'object' && it && 'content' in it
                      ? it.content
                      : null,
                  )
                  .filter(Boolean),
                shuffleEnabled: false,
                shouldAssignIds: true,
              },
            });
          }
        });
    },
  );
  window.ipcRenderer.on(
    'ytmd:move-in-queue',
    (_, fromIndex: number, toIndex: number) => {
      const queue = document.querySelector<QueueElement>('#queue');
      queue?.dispatch({
        type: 'MOVE_ITEM',
        payload: {
          fromIndex,
          toIndex,
        },
      });
    },
  );
  window.ipcRenderer.on('ytmd:remove-from-queue', (_, index: number) => {
    const queue = document.querySelector<QueueElement>('#queue');
    queue?.dispatch({
      type: 'REMOVE_ITEM',
      payload: index,
    });
  });
  window.ipcRenderer.on('ytmd:set-queue-index', (_, index: number) => {
    const queue = document.querySelector<QueueElement>('#queue');
    queue?.dispatch({
      type: 'SET_INDEX',
      payload: index,
    });
  });
  window.ipcRenderer.on('ytmd:clear-queue', () => {
    const queue = document.querySelector<QueueElement>('#queue');
    queue?.queue.store.store.dispatch({
      type: 'SET_PLAYER_PAGE_INFO',
      payload: { open: false },
    });
    queue?.dispatch({
      type: 'CLEAR',
    });
  });

  window.ipcRenderer.on(
    'ytmd:search',
    async (_, query: string, params?: string, continuation?: string) => {
      const app = document.querySelector<YouTubeMusicAppElement>('ytmusic-app');
      const searchBox =
        document.querySelector<SearchBoxElement>('ytmusic-search-box');

      if (!app || !searchBox) return;

      const result = await app.networkManager.fetch('/search', {
        query,
        params,
        continuation,
        suggestStats: searchBox.getSearchboxStats(),
      });

      window.ipcRenderer.send('ytmd:search-results', result);
    },
  );

  // Track recent user gestures to distinguish autoplay from intentional user play
  let lastUserGestureAt = 0;
  const recordUserGesture = () => {
    lastUserGestureAt = Date.now();
  };
  document.addEventListener('pointerdown', recordUserGesture, {
    passive: true,
  });
  document.addEventListener('keydown', recordUserGesture, {
    passive: true,
  });
  document.addEventListener('touchstart', recordUserGesture, {
    passive: true,
  });
  document.addEventListener('mousedown', recordUserGesture, {
    passive: true,
  });

  // Guard: if resumeOnStart is disabled, pause playback once when initial data loads
  const ensurePausedOnFirstLoad = (evt: Event) => {
    try {
      const e = evt as CustomEvent<{ name?: string }>;
      if (e?.detail?.name !== 'dataloaded') return;

      // Remove this guard after the first relevant event
      document.removeEventListener(
        'videodatachange',
        ensurePausedOnFirstLoad as EventListener,
      );

      const shouldResume = window.mainConfig.get('options.resumeOnStart');
      if (shouldResume) return;

      // If a recent user gesture happened, don't block playback
      const recentGesture = Date.now() - lastUserGestureAt < 3000;
      if (recentGesture) return;

      api?.pauseVideo?.();
      const vid = document.querySelector<HTMLVideoElement>('video');
      vid?.addEventListener(
        'timeupdate',
        () => {
          vid.pause();
        },
        { once: true },
      );
    } catch {
      // no-op
    }
  };
  document.addEventListener('videodatachange', ensurePausedOnFirstLoad as EventListener);

  const video = document.querySelector('video')!;
  const audioContext = new AudioContext();
  const audioSource = audioContext.createMediaElementSource(video);
  audioSource.connect(audioContext.destination);

  for (const [id, plugin] of Object.entries(getAllLoadedRendererPlugins())) {
    if (typeof plugin.renderer !== 'function') {
      await plugin.renderer?.onPlayerApiReady?.call(
        plugin.renderer,
        api!,
        createContext(id),
      );
    }
  }

  if (firstDataLoaded) {
    document.dispatchEvent(
      new CustomEvent('videodatachange', { detail: { name: 'dataloaded' } }),
    );
  }

  const audioCanPlayEventDispatcher = () => {
    document.dispatchEvent(
      new CustomEvent('ytmd:audio-can-play', {
        detail: {
          audioContext,
          audioSource,
        },
      }),
    );
  };

  const loadstartListener = () => {
    // Emit "audioCanPlay" for each video
    video.addEventListener('canplaythrough', audioCanPlayEventDispatcher, {
      once: true,
    });
  };

  if (video.readyState === 4 /* HAVE_ENOUGH_DATA (loaded) */) {
    audioCanPlayEventDispatcher();
  }

  video.addEventListener('loadstart', loadstartListener, { passive: true });

  window.ipcRenderer.send('ytmd:player-api-loaded');

  // Navigate to "Starting page"
  const startingPage: string = window.mainConfig.get('options.startingPage');
  if (startingPage && startingPages[startingPage]) {
    document
      .querySelector<YouTubeMusicAppElement>('ytmusic-app')
      ?.navigate(startingPages[startingPage]);
  }

  // Remove upgrade button
  if (window.mainConfig.get('options.removeUpgradeButton')) {
    const itemsSelector = 'ytmusic-guide-section-renderer #items';
    let selector = 'ytmusic-guide-entry-renderer:last-child';

    const upgradeBtnIcon = document.querySelector<SVGGElement>(
      'iron-iconset-svg[name="yt-sys-icons"] #youtube_music_monochrome',
    );
    if (upgradeBtnIcon) {
      const path = upgradeBtnIcon.firstChild as SVGPathElement;
      const data = path.getAttribute('d')!.substring(0, 15);
      selector = `ytmusic-guide-entry-renderer:has(> tp-yt-paper-item > yt-icon path[d^="${data}"])`;
    }

    const styles = document.createElement('style');
    styles.textContent = `${itemsSelector} ${selector} { display: none; }`;

    document.head.appendChild(styles);
  }

  // Hide / Force show like buttons
  const likeButtonsOptions: string = window.mainConfig.get(
    'options.likeButtons',
  );
  if (likeButtonsOptions) {
    const style = document.createElement('style');
    style.textContent = `
      ytmusic-player-bar[is-mweb-player-bar-modernization-enabled] .middle-controls-buttons.ytmusic-player-bar, #like-button-renderer {
        display: ${likeButtonsOptions === 'hide' ? 'none' : 'inherit'} !important;
      }
      ytmusic-player-bar[is-mweb-player-bar-modernization-enabled] .middle-controls.ytmusic-player-bar {
        justify-content: ${likeButtonsOptions === 'hide' ? 'flex-start' : 'space-between'} !important;
      }`;

    document.head.appendChild(style);
  }

  // --- Custom: Add Ctrl+K shortcut for search bar and update placeholder ---
  const setSearchBarShortcut = () => {
    const searchBox = document.querySelector('ytmusic-search-box');
    if (!searchBox) return;
    // Try to get the input inside the shadow DOM
    let input = null;
    let root = searchBox.shadowRoot || searchBox;
    input = root.querySelector('input');
    if (input) {
      // Set placeholder to indicate shortcut
      input.setAttribute('placeholder', 'What do you want to listen to?');

      // Remove any previous overlay keycap row
      const prevOverlay = document.getElementById('ytm-keycap-overlay');
      if (prevOverlay) prevOverlay.remove();

      // Hide the recent searches dropdown in the main searchbar
      if (!document.getElementById('ytm-hide-search-dropdown-style')) {
        const style = document.createElement('style');
        style.id = 'ytm-hide-search-dropdown-style';
        style.textContent = `
          ytmusic-search-box ytmusic-suggestions,
          ytmusic-search-box .suggestions,
          ytmusic-search-box #suggestions,
          ytmusic-search-box tp-yt-paper-listbox,
          ytmusic-search-box .suggestion,
          ytmusic-search-box .suggestion-list,
          ytmusic-search-box .searchbox-suggestions,
          ytmusic-search-box .searchbox-suggestion,
          ytmusic-search-box .searchbox-recent,
          ytmusic-search-box .searchbox-recent-list,
          ytmusic-search-box .searchbox-recent-suggestion {
            display: none !important;
          }
        `;
        document.head.appendChild(style);
      }

      // Get the bounding rect of the search box (relative to viewport)
      const rect = searchBox.getBoundingClientRect();
      // Create overlay element
      const overlay = document.createElement('div');
      overlay.id = 'ytm-keycap-overlay';
      overlay.style.position = 'fixed';
      overlay.style.pointerEvents = 'none'; // allow clicks to pass through
      overlay.style.zIndex = '10000';
      overlay.style.top = rect.top + 'px';
      overlay.style.left = rect.left + 'px';
      overlay.style.width = rect.width + 'px';
      overlay.style.height = rect.height + 'px';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'flex-end';
      overlay.style.paddingRight = '32px'; // Add more space to the right
      // Create keycap element (copied from overlay-search)
      function createKeycap(text: string) {
        const span = document.createElement('span');
        span.textContent = text;
        span.style.display = 'inline-flex';
        span.style.justifyContent = 'center';
        span.style.alignItems = 'center';
        span.style.background = 'rgba(40,40,40,0.9)';
        span.style.border = '1px solid #888';
        span.style.borderRadius = '6px';
        span.style.padding = '2px 8px';
        span.style.marginLeft = '0';
        span.style.fontFamily = 'inherit';
        span.style.fontSize = '0.95em';
        span.style.color = '#fff';
        span.style.boxShadow = '0 1px 2px #0003';
        span.style.verticalAlign = 'middle';
        return span;
      }
      // Create the keycap row
      const keycapRow = document.createElement('div');
      keycapRow.style.display = 'flex';
      keycapRow.style.alignItems = 'center';
      keycapRow.style.gap = '0';
      keycapRow.style.height = '70%';
      keycapRow.style.marginRight = '8px'; // Add a little margin from the right edge
      // Build keycap icons
      const keycapCtrl = createKeycap('Ctrl');
      const plus = document.createElement('span');
      plus.textContent = '+';
      plus.style.margin = '0 4px';
      plus.style.color = '#888';
      plus.style.fontWeight = 'bold';
      plus.style.display = 'inline-flex';
      plus.style.alignItems = 'center';
      const keycapK = createKeycap('K');
      keycapRow.appendChild(keycapCtrl);
      keycapRow.appendChild(plus);
      keycapRow.appendChild(keycapK);
      overlay.appendChild(keycapRow);
      document.body.appendChild(overlay);

      // Function to update overlay position on resize/scroll
      function updateOverlayPosition() {
        const sb = document.querySelector('ytmusic-search-box');
        if (!sb || !document.body.contains(overlay)) return;
        const rect = sb.getBoundingClientRect();
        overlay.style.top = rect.top + 'px';
        overlay.style.left = rect.left + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';
      }
      // Listen for window resize/scroll to reposition overlay
      window.addEventListener('resize', updateOverlayPosition);
      window.addEventListener('scroll', updateOverlayPosition, true);
      // Also update on SPA navigation (MutationObserver already calls setSearchBarShortcut)
    }
  };

  // Set placeholder on load and when search bar is re-rendered
  setSearchBarShortcut();
  // Observe for search bar changes (in case of SPA navigation)
  const searchBarObserver = new MutationObserver(setSearchBarShortcut);
  const navBar = document.querySelector('ytmusic-nav-bar');
  if (navBar) {
    searchBarObserver.observe(navBar, { childList: true, subtree: true });
  }

  // Remove previous Ctrl+K search bar logic and instead show the overlay
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !e.repeat) {
      // Only trigger if not in an input/textarea already
      const active = document.activeElement;
      if (!active || (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA' && (active as HTMLElement).contentEditable !== 'true')) {
        e.preventDefault();
        showOverlaySearch();
      }
    }
  });
  // --- End Custom ---
}

/**
 * YouTube Music still using ES5, so we need to define custom elements using ES5 style
 */
const defineYTMDTransElements = () => {
  const YTMDTrans = function () {};
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  YTMDTrans.prototype = Object.create(HTMLElement.prototype);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  YTMDTrans.prototype.connectedCallback = function () {
    const that = this as HTMLElement;
    const key = that.getAttribute('key');
    if (key) {
      const targetHtml = 'Data loaded';
      (that.innerHTML as string | TrustedHTML) = defaultTrustedTypePolicy
        ? defaultTrustedTypePolicy.createHTML(targetHtml)
        : targetHtml;
    }
  };
  customElements.define(
    'ytmd-trans',
    YTMDTrans as unknown as CustomElementConstructor,
  );
};

const preload = async () => {
  if (document.body?.dataset?.os) {
    document.body.dataset.os = navigator.userAgent;
  }
};

/**
 * Suppress native browser tooltips by removing `title` attributes globally,
 * except when explicitly opted-in via `data-allow-native-tooltip`.
 * Custom tooltips implemented via `[data-tooltip]` remain unaffected.
 */
function suppressNativeTooltips(root: ParentNode = document) {
  const processElement = (el: Element) => {
    if (el.hasAttribute('data-allow-native-tooltip')) return;
    if (el.hasAttribute('title')) {
      const original = el.getAttribute('title');
      if (original && !el.hasAttribute('data-original-title')) {
        el.setAttribute('data-original-title', original);
      }
      el.removeAttribute('title');
    }
  };

  // Initial sweep
  root.querySelectorAll('[title]').forEach(processElement);

  // Intercept future attempts to set title dynamically
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'title') {
        const target = mutation.target as Element;
        processElement(target);
      } else if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;
            processElement(element);
            element.querySelectorAll?.('[title]').forEach(processElement);
          }
        });
      }
    }
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['title'],
  });

  // Defensive: clear tooltip just before it would show
  const clearOnHover = (e: Event) => {
    const target = e.target as Element | null;
    if (!target || target.hasAttribute('data-allow-native-tooltip')) return;
    if (target.hasAttribute('title')) {
      const original = target.getAttribute('title');
      if (original && !target.hasAttribute('data-original-title')) {
        target.setAttribute('data-original-title', original);
      }
      target.removeAttribute('title');
    }
  };
  document.addEventListener('mouseover', clearOnHover, { passive: true });
  document.addEventListener('focusin', clearOnHover, { passive: true });
}

const main = async () => {
  await loadAllRendererPlugins();
  isPluginLoaded = true;

  window.ipcRenderer.on('plugin:unload', async (_event, id: string) => {
    await forceUnloadRendererPlugin(id);
  });
  window.ipcRenderer.on('plugin:enable', async (_event, id: string) => {
    await forceLoadRendererPlugin(id);
    if (api) {
      const plugin = getLoadedRendererPlugin(id);
      if (plugin && typeof plugin.renderer !== 'function') {
        await plugin.renderer?.onPlayerApiReady?.call(
          plugin.renderer,
          api,
          createContext(id),
        );
      }
    }
  });

  window.ipcRenderer.on(
    'config-changed',
    (_event, id: string, newConfig: PluginConfig) => {
      const plugin = getAllLoadedRendererPlugins()[id];
      if (plugin && typeof plugin.renderer !== 'function') {
        plugin.renderer?.onConfigChange?.call(plugin.renderer, newConfig);
      }
    },
  );

  // Wait for complete load of YouTube api
  await listenForApiLoad();

  // Disable native tooltips globally
  suppressNativeTooltips();

  // Blocks the "Are You Still There?" popup by setting the last active time to Date.now every 15min
  setInterval(() => (window._lact = Date.now()), 900_000);

  // Setup back to front logger
  if (window.electronIs.dev()) {
    window.ipcRenderer.on('log', (_event, log: string) => {
      JSON.parse(log);
    });
  }
};

const initObserver = async () => {
  // check document.documentElement is ready
  await new Promise<void>((resolve) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => resolve(), {
        once: true,
      });
    } else {
      resolve();
    }
  });

  const observer = new MutationObserver(() => {
    const playerApi = document.querySelector<Element & YoutubePlayer>(
      '#movie_player',
    );
    if (playerApi) {
      observer.disconnect();

      // Inject song-info provider
      setupSongInfo(playerApi);
      const dataLoadedListener = (name: string) => {
        if (!firstDataLoaded && name === 'dataloaded') {
          firstDataLoaded = true;
          playerApi.removeEventListener('videodatachange', dataLoadedListener);
        }
      };
      playerApi.addEventListener('videodatachange', dataLoadedListener);

      if (isPluginLoaded && !isApiLoaded) {
        api = playerApi;
        isApiLoaded = true;

        onApiLoaded();
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
};

initObserver().then(preload).then(main);
