import { Menu, MenuItem } from 'electron';
import {
  createEffect,
  createResource,
  createSignal,
  Index,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
  JSX,
} from 'solid-js';
import { css } from 'solid-styled-components';
import { TransitionGroup } from 'solid-transition-group';

import { MenuButton } from './MenuButton';
import { Panel } from './Panel';
import { PanelItem } from './PanelItem';
import { IconButton } from './IconButton';
import { WindowController } from './WindowController';

import { cacheNoArgs } from '@/providers/decorators';

import type { RendererContext } from '@/types/contexts';
import type { InAppMenuConfig } from '../constants';

const titleStyle = cacheNoArgs(
  () => css`
    -webkit-app-region: drag;
    box-sizing: border-box;

    position: fixed;
    top: 0;
    z-index: 1000;

    width: 100%;
    height: var(--menu-bar-height, 32px);

    display: flex;
    flex-flow: row;
    justify-content: flex-start;
    align-items: center;
    gap: 4px;

    color: #f1f1f1;
    font-size: 12px;
    padding: 4px 4px 4px var(--offset-left, 4px);
    background-color: var(--titlebar-background-color, #030303);
    user-select: none;

    transition:
      opacity 200ms ease 0s,
      transform 300ms cubic-bezier(0.2, 0, 0.6, 1) 0s,
      background-color 300ms cubic-bezier(0.2, 0, 0.6, 1) 0s;

    &[data-macos='true'] {
      padding: 4px 4px 4px 74px;
    }

    ytmusic-app:has(ytmusic-player[player-ui-state='FULLSCREEN'])
      ~ &:not([data-show='true']) {
      transform: translateY(calc(-1 * var(--menu-bar-height, 32px)));
    }
  `,
);

const separatorStyle = cacheNoArgs(
  () => css`
    min-height: 1px;
    height: 1px;
    margin: 4px 0;

    background-color: rgba(255, 255, 255, 0.2);
  `,
);

const animationStyle = cacheNoArgs(() => ({
  enter: css`
    opacity: 0;
    transform: translateX(-50%) scale(0.8);
  `,
  enterActive: css`
    transition:
      opacity 0.1s cubic-bezier(0.33, 1, 0.68, 1),
      transform 0.1s cubic-bezier(0.33, 1, 0.68, 1);
  `,
  exitTo: css`
    opacity: 0;
    transform: translateX(-50%) scale(0.8);
  `,
  exitActive: css`
    transition:
      opacity 0.1s cubic-bezier(0.32, 0, 0.67, 0),
      transform 0.1s cubic-bezier(0.32, 0, 0.67, 0);
  `,
  move: css`
    transition: all 0.1s cubic-bezier(0.65, 0, 0.35, 1);
  `,
  fakeTarget: css`
    position: absolute;
    opacity: 0;
  `,
  fake: css`
    transition: all 0.00000000001s;
  `,
}));

export type PanelRendererProps = {
  items: Electron.Menu['items'];
  level?: number[];
  onClick?: (commandId: number, radioGroup?: MenuItem[]) => void;
  onMenuHover?: (hover: boolean) => void;
};
const PanelRenderer = (props: PanelRendererProps) => {
  const radioGroup = () => props.items.filter((it) => it.type === 'radio');

  return (
    <Index each={props.items}>
      {(subItem) => (
        <Show when={subItem().visible}>
          <Switch>
            <Match when={subItem().type === 'normal'}>
              <div onMouseEnter={() => props.onMenuHover?.(true)} onMouseLeave={() => props.onMenuHover?.(false)}>
                <PanelItem
                  type={'normal'}
                  name={subItem().label}
                  chip={subItem().sublabel}
                  toolTip={subItem().toolTip}
                  commandId={subItem().commandId}
                  onClick={() => props.onClick?.(subItem().commandId)}
                />
              </div>
            </Match>
            <Match when={subItem().type === 'submenu'}>
              <div onMouseEnter={() => props.onMenuHover?.(true)} onMouseLeave={() => props.onMenuHover?.(false)}>
                <PanelItem
                  type={'submenu'}
                  name={subItem().label}
                  chip={subItem().sublabel}
                  toolTip={subItem().toolTip}
                  level={[...(props.level ?? []), subItem().commandId]}
                  commandId={subItem().commandId}
                >
                  <PanelRenderer
                    items={subItem().submenu?.items ?? []}
                    level={[...(props.level ?? []), subItem().commandId]}
                    onClick={props.onClick}
                    onMenuHover={props.onMenuHover}
                  />
                </PanelItem>
              </div>
            </Match>
            <Match when={subItem().type === 'checkbox'}>
              <div onMouseEnter={() => props.onMenuHover?.(true)} onMouseLeave={() => props.onMenuHover?.(false)}>
                <PanelItem
                  type={'checkbox'}
                  name={subItem().label}
                  checked={subItem().checked}
                  chip={subItem().sublabel}
                  toolTip={subItem().toolTip}
                  commandId={subItem().commandId}
                  onChange={() => props.onClick?.(subItem().commandId)}
                />
              </div>
            </Match>
            <Match when={subItem().type === 'radio'}>
              <div onMouseEnter={() => props.onMenuHover?.(true)} onMouseLeave={() => props.onMenuHover?.(false)}>
                <PanelItem
                  type={'radio'}
                  name={subItem().label}
                  checked={subItem().checked}
                  chip={subItem().sublabel}
                  toolTip={subItem().toolTip}
                  commandId={subItem().commandId}
                  onChange={() =>
                    props.onClick?.(subItem().commandId, radioGroup())
                  }
                />
              </div>
            </Match>
            <Match when={subItem().type === 'separator'}>
              <hr class={separatorStyle()} />
            </Match>
          </Switch>
        </Show>
      )}
    </Index>
  );
};

export type TitleBarProps = {
  ipc: RendererContext<InAppMenuConfig>['ipc'];
  isMacOS?: boolean;
  enableController?: boolean;
  initialCollapsed?: boolean;
};
export const TitleBar = (props: TitleBarProps) => {
  const [collapsed, setCollapsed] = createSignal(props.initialCollapsed);
  const [ignoreTransition, setIgnoreTransition] = createSignal(false);
  const [openTarget, setOpenTarget] = createSignal<HTMLElement | null>(null);
  const [menu, setMenu] = createSignal<Menu | null>(null);
  const [mouseY, setMouseY] = createSignal(0);
  
  // Restored menu state variables
  const [menuHover, setMenuHover] = createSignal(false);
  const [isMenuOpen, setIsMenuOpen] = createSignal(false);

  // Account info state
  const [accountAvatar, setAccountAvatar] = createSignal<string | null>(null);
  const [accountName, setAccountName] = createSignal<string | null>(null);

  // Don't hide the original account button since we're moving it
  function hideOriginalAccountButton() {
    // We'll move the button instead of hiding it
  }

  // Fetch account info (avatar, name)
  async function fetchAccountInfo() {
    // Wait for the account button to exist
    const waitForElement = async (selector: string, maxRetry = 10000) => {
      let el = null;
      let waited = 0;
      while (!el && waited < maxRetry) {
        el = document.querySelector(selector);
        if (!el) await new Promise(r => setTimeout(r, 100));
        waited += 100;
      }
      return el;
    };
    const accountButton = await waitForElement('#right-content > ytmusic-settings-button *:where(tp-yt-paper-icon-button,yt-icon-button,.ytmusic-settings-button)');
    if (!accountButton) return;
    (accountButton as HTMLElement).click();
    setTimeout(async () => {
      const renderer = await waitForElement('ytd-active-account-header-renderer');
      if (!renderer) return;
      // Try to extract data from the renderer
      const data = (renderer as any).data;
      if (data && data.accountPhoto && data.accountPhoto.thumbnails && data.accountPhoto.thumbnails[0]) {
        setAccountAvatar(data.accountPhoto.thumbnails[0].url);
      }
      if (data && data.accountName && data.accountName.runs && data.accountName.runs[0]) {
        setAccountName(data.accountName.runs[0].text);
      }
      (accountButton as HTMLElement).click(); // close menu
    }, 0);
  }

  // Restored menu handling functions
  const handleMenuHover = (hover: boolean) => {
    setMenuHover(hover);
  };

  const handleMenuOpen = (target: HTMLElement) => {
    setOpenTarget(target);
    setIsMenuOpen(true);
  };

  const handleMenuClose = () => {
    setOpenTarget(null);
    setIsMenuOpen(false);
  };

  const [data, { refetch }] = createResource(
    async () => (await props.ipc.invoke('get-menu')) as Promise<Menu | null>,
  );
  const [isMaximized, { refetch: refetchMaximize }] = createResource(
    async () =>
      (await props.ipc.invoke('window-is-maximized')) as Promise<boolean>,
  );

  const handleToggleMaximize = async () => {
    if (isMaximized()) {
      await props.ipc.invoke('window-unmaximize');
    } else {
      await props.ipc.invoke('window-maximize');
    }
    await refetchMaximize();
  };
  const handleMinimize = async () => {
    await props.ipc.invoke('window-minimize');
  };
  const handleClose = async () => {
    await props.ipc.invoke('window-close');
  };

  const refreshMenuItem = async (originalMenu: Menu, commandId: number) => {
    const menuItem = (await window.ipcRenderer.invoke(
      'get-menu-by-id',
      commandId,
    )) as MenuItem | null;

    const newMenu = structuredClone(originalMenu);
    const stack = [...(newMenu?.items ?? [])];
    let now: MenuItem | undefined = stack.pop();
    while (now) {
      const index =
        now?.submenu?.items?.findIndex((it) => it.commandId === commandId) ??
        -1;

      if (index >= 0) {
        if (menuItem) now?.submenu?.items?.splice(index, 1, menuItem);
        else now?.submenu?.items?.splice(index, 1);
      }
      if (now?.submenu) {
        stack.push(...now.submenu.items);
      }

      now = stack.pop();
    }

    return newMenu;
  };

  const handleItemClick = async (
    commandId: number,
    radioGroup?: MenuItem[],
  ) => {
    const menuData = menu();
    if (!menuData) return;

    if (Array.isArray(radioGroup)) {
      let newMenu = menuData;
      for (const item of radioGroup) {
        newMenu = await refreshMenuItem(newMenu, item.commandId);
      }

      setMenu(newMenu);
      return;
    }

    setMenu(await refreshMenuItem(menuData, commandId));
  };

  const listener = (e: MouseEvent) => {
    setMouseY(e.clientY);
  };

  // Restored click outside listener for menu
  const handleClickOutside = (e: MouseEvent) => {
    if (isMenuOpen() && openTarget()) {
      const target = e.target as Element;
      if (!openTarget()!.contains(target) && !target.closest('[data-ytmd-panel]')) {
        handleMenuClose();
      }
    }
  };

  onMount(() => {
    props.ipc.on('close-all-in-app-menu-panel', async () => {
      setIgnoreTransition(true);
      setMenu(null);
      await refetch();
      setMenu(data() ?? null);
      setIgnoreTransition(false);
    });
    props.ipc.on('refresh-in-app-menu', async () => {
      setIgnoreTransition(true);
      await refetch();
      setMenu(data() ?? null);
      setIgnoreTransition(false);
    });
    props.ipc.on('toggle-in-app-menu', () => {
      setCollapsed(!collapsed());
    });

    props.ipc.on('window-maximize', refetchMaximize);
    props.ipc.on('window-unmaximize', refetchMaximize);

    // Restored menu click outside listener
    document.addEventListener('click', handleClickOutside);

    // tracking mouse position
    window.addEventListener('mousemove', listener);
    const ytmusicAppLayout = document.querySelector<HTMLElement>('#layout');
    ytmusicAppLayout?.addEventListener('scroll', () => {
      const scrollValue = ytmusicAppLayout.scrollTop;
      if (scrollValue > 20) {
        ytmusicAppLayout.classList.add('content-scrolled');
      } else {
        ytmusicAppLayout.classList.remove('content-scrolled');
      }
    });
    hideOriginalAccountButton();
    fetchAccountInfo();

    // Robustly move the original account button next to the search bar
    const moveOriginalAccountButton = () => {
      const maxTries = 50;
      let tries = 0;
      const tryMove = () => {
        const orig = document.querySelector('#right-content > ytmusic-settings-button');
        const searchBarContainer = document.querySelector('.ytm-custom-search-bar')?.parentElement;
        

        
        if (orig && searchBarContainer) {
          const origEl = orig as HTMLElement;
          
          // Remove any previous wrapper
          let avatarWrapper = document.getElementById('ytm-titlebar-avatar-wrapper');
          if (!avatarWrapper) {
            avatarWrapper = document.createElement('div');
            avatarWrapper.id = 'ytm-titlebar-avatar-wrapper';
            avatarWrapper.style.cssText = `
              display: flex;
              align-items: center;
              margin-left: 12px;
              z-index: 100001;
            `;
          }
          
          // Style the button
          origEl.style.cssText = `
            display: flex !important;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            overflow: hidden;
            background: #333;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            transition: all 0.2s ease;
            cursor: pointer;
          `;
          
          // Style the image inside
          const img = orig.querySelector('img, yt-img-shadow img, tp-yt-paper-icon-button img');
          if (img) {
            (img as HTMLElement).style.cssText = `
              width: 100%;
              height: 100%;
              object-fit: cover;
              border-radius: 50%;
            `;
          }
          
          // Move the button
          if (avatarWrapper.contains(origEl)) {

          } else {
            avatarWrapper.appendChild(origEl);
            searchBarContainer.appendChild(avatarWrapper);

          }
        } else if (tries < maxTries) {
          tries++;
          setTimeout(tryMove, 200);
        } else {
          console.warn('Could not find account button or search container after', maxTries * 200, 'ms');
        }
      };
      
      // Start immediately and also after a delay
      tryMove();
      setTimeout(tryMove, 1000);
    };
    moveOriginalAccountButton();

    // MutationObserver to raise account dropdown z-index
    const raiseAccountDropdownZ = () => {
      const setDropdownZ = () => {
        // Try both dialog and account header renderer
        const dropdown = document.querySelector('tp-yt-paper-dialog[role="dialog"], ytd-active-account-header-renderer');
        if (dropdown && dropdown instanceof HTMLElement) {
          dropdown.style.zIndex = '30000';
        }
      };
      // Observe body for new children
      const observer = new MutationObserver(() => setDropdownZ());
      observer.observe(document.body, { childList: true, subtree: true });
      // Also try immediately in case already present
      setDropdownZ();
    };
    raiseAccountDropdownZ();
  });

  createEffect(() => {
    if (!menu() && data()) {
      setMenu(data() ?? null);
    }
  });

  onCleanup(() => {
    window.removeEventListener('mousemove', listener);
    document.removeEventListener('click', handleClickOutside);
  });

  return (
    <nav
      data-ytmd-main-panel={true}
      class={titleStyle()}
      data-macos={props.isMacOS}
      data-show={mouseY() < 32}
      style={{ position: 'fixed', top: 0, left: 0, width: '100%', 'z-index': 1000, display: 'flex', 'flex-direction': 'row', 'align-items': 'center', 'justify-content': 'space-between' }}
    >
      {/* Left: Menu and navigation */}
      <div style={`display: flex; align-items: center; gap: 4px; margin-left: 8px; -webkit-app-region: no-drag;`}>
        {/* Burger menu button */}
        <Show when={!collapsed()}>
          <Show when={menu()?.items?.length}>
            <button
              style={`width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: ${isMenuOpen() ? 'rgba(255,255,255,0.1)' : 'transparent'}; border: none; cursor: pointer; border-radius: 6px; transition: all 0.2s ease; -webkit-app-region: no-drag; color: #f1f1f1; transform: ${isMenuOpen() ? 'rotate(90deg)' : 'rotate(0deg)'};`}
              onMouseEnter={(e) => {
                if (!isMenuOpen()) {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isMenuOpen()) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const target = e.currentTarget as HTMLElement;
                if (openTarget() === target) {
                  handleMenuClose();
                } else {
                  handleMenuOpen(target);
                }
              }}
              title="Menu"
            >
              <svg 
                width="18" 
                height="18" 
                viewBox="0 0 24 24" 
                fill="currentColor"
                style={`transition: all 0.2s ease;`}
              >
                <Show 
                  when={!isMenuOpen()}
                  fallback={
                    <g>
                      <path d="M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
                      <path d="M18 6l-12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
                    </g>
                  }
                >
                  <g>
                    <path d="M3 18h18v-2H3v2z" style={`transition: all 0.2s ease;`}/>
                    <path d="M3 13h18v-2H3v2z" style={`transition: all 0.2s ease;`}/>
                    <path d="M3 6h18v2H3z" style={`transition: all 0.2s ease;`}/>
                  </g>
                </Show>
              </svg>
            </button>
          </Show>
        </Show>
        
        {/* Back arrow */}
        <button
          style={`width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; cursor: pointer; border-radius: 6px; transition: all 0.2s ease; -webkit-app-region: no-drag; color: #f1f1f1;`}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
          onClick={() => {
            if (window.navigation && typeof window.navigation.back === 'function') {
              window.navigation.back();
            } else {
              window.history.back();
            }
          }}
          title="Back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
        </button>
        {/* Forward arrow */}
        <button
          style={`width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; cursor: pointer; border-radius: 6px; transition: all 0.2s ease; -webkit-app-region: no-drag; color: #f1f1f1;`}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
          onClick={() => {
            if (window.navigation && typeof window.navigation.forward === 'function') {
              window.navigation.forward();
            } else {
              window.history.forward();
            }
          }}
          title="Forward"
        >
          <svg width="20" height="20" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
        </button>
      </div>
      
      {/* Center: Search bar, fixed absolute center */}
      <div style={`position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 1001; -webkit-app-region: no-drag; display: flex; align-items: center;`}>
        <SearchBar />
        {/* The original account button will be moved here by JS */}
      </div>
      
      {/* Right side: Window controls */}
      <div style={`display: flex; align-items: center; gap: 4px; margin-right: 8px; -webkit-app-region: no-drag;`}>
        <Show when={props.enableController}>
          <WindowController
            isMaximize={isMaximized()}
            onToggleMaximize={handleToggleMaximize}
            onMinimize={handleMinimize}
            onClose={handleClose}
          />
        </Show>
      </div>
      
      {/* Menu panels */}
      <Show when={openTarget() && menu()}>
        <div
          style={{
            position: 'fixed',
            'z-index': '10000',
            left: `${openTarget()!.getBoundingClientRect().left}px`,
            top: `${openTarget()!.getBoundingClientRect().bottom + 4}px`,
            'min-width': '200px',
            'max-width': '300px',
            'max-height': '400px',
            padding: '4px',
            'box-sizing': 'border-box',
            'border-radius': '8px',
            overflow: 'auto',
            background: 'color-mix(in srgb, var(--titlebar-background-color, #030303) 50%, rgba(0, 0, 0, 0.1))',
            'backdrop-filter': 'blur(8px)',
            'box-shadow': '0 0 0 1px rgba(0, 0, 0, 0.05), 0 2px 8px rgba(0, 0, 0, 0.2)',
            'scrollbar-width': 'thin',
            'scrollbar-color': '#555 #2a2a2a'
          } as any}
          onScroll={(e) => {
            // Ensure dark scrollbar styles are applied
            const target = e.currentTarget as HTMLElement;
            target.style.setProperty('scrollbar-color', '#555 #2a2a2a');
          }}
        >
          <style>{`
            [data-ytmd-sub-panel]::-webkit-scrollbar {
              width: 8px;
            }
            [data-ytmd-sub-panel]::-webkit-scrollbar-track {
              background: #2a2a2a;
              border-radius: 4px;
            }
            [data-ytmd-sub-panel]::-webkit-scrollbar-thumb {
              background: #555;
              border-radius: 4px;
            }
            [data-ytmd-sub-panel]::-webkit-scrollbar-thumb:hover {
              background: #666;
            }
          `}</style>
          <PanelRenderer
            items={menu()?.items ?? []}
            onClick={handleItemClick}
            onMenuHover={handleMenuHover}
          />
        </div>
      </Show>
    </nav>
  );
};

function SearchBar() {
  const [value, setValue] = createSignal('');
  const [suggestions, setSuggestions] = createSignal<Suggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = createSignal(-1);
  const [isFocused, setIsFocused] = createSignal(false); // <-- Add focus state
  let inputRef: HTMLInputElement | undefined;
  let suggestionBoxRef: HTMLDivElement | undefined;
  let barRef: HTMLDivElement | undefined;

  // Helper to sync dropdown width to searchbar container
  function syncDropdownWidth() {
    if (barRef && suggestionBoxRef) {
      suggestionBoxRef.style.width = barRef.offsetWidth + 'px';
    }
  }

  // Sync width on mount and on every input change
  createEffect(() => {
    syncDropdownWidth();
  });

  // --- Blur input when clicking outside ---
  onMount(() => {
    const handleClick = (e: PointerEvent) => {
      if (barRef && inputRef) {
        if (!barRef.contains(e.target as Node)) {

          inputRef.blur();
        }
      }
    };
    document.addEventListener('pointerdown', handleClick);
    onCleanup(() => {
      document.removeEventListener('pointerdown', handleClick);
    });
  });
  // --- End blur logic ---

  type Suggestion = { text: string; url?: string; icon?: string; subtitle?: string; type?: string };

  async function fetchSuggestions(query: string): Promise<Suggestion[]> {
    const app = document.querySelector('ytmusic-app') as any;
    if (!app || !app.networkManager) return [];
    let result: any;
    try {
      result = await app.networkManager.fetch('/search', { query });
    } catch (e) {
      return [];
    }
    const suggestions: Suggestion[] = [];
    try {
      const tabs = result?.contents?.tabbedSearchResultsRenderer?.tabs || [];
      for (const tab of tabs) {
        const sectionList = tab.tabRenderer?.content?.sectionListRenderer;
        if (!sectionList) continue;
        for (const section of sectionList.contents || []) {
          if (section.musicShelfRenderer) {
            const type = section.musicShelfRenderer.title?.runs?.[0]?.text || '';
            for (const item of section.musicShelfRenderer.contents || []) {
              const renderer = item.musicResponsiveListItemRenderer;
              if (!renderer) continue;
              const text = renderer.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || '';
              const subtitle = renderer.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.map((r: any) => r.text).join(', ');
              const icon = renderer.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails?.[0]?.url;
              let url = '';
              if (renderer.navigationEndpoint?.watchEndpoint?.videoId) {
                url = `https://music.youtube.com/watch?v=${renderer.navigationEndpoint.watchEndpoint.videoId}`;
              } else if (renderer.navigationEndpoint?.browseEndpoint?.browseId) {
                url = `https://music.youtube.com/browse/${renderer.navigationEndpoint.browseEndpoint.browseId}`;
              }
              suggestions.push({ text, url, icon, subtitle, type });
            }
          }
        }
      }
    } catch (e) {}
    suggestions.sort((a, b) => {
      const aIsArtist = a.type && a.type.toLowerCase().includes('artist');
      const bIsArtist = b.type && b.type.toLowerCase().includes('artist');
      if (aIsArtist && !bIsArtist) return -1;
      if (!aIsArtist && bIsArtist) return 1;
      return 0;
    });
    return suggestions;
  }

  async function onInput(e: InputEvent) {
    const target = e.currentTarget as HTMLInputElement;
    const v = target.value.trim();
    setValue(target.value);
    setSuggestions([]); // Clear immediately
    setSelectedIndex(-1);
    if (!v) return;
    const sugg = await fetchSuggestions(v);
    if (value().trim() === v) {
      setSuggestions(sugg);
      setSelectedIndex(-1);
    }
  }

  function chooseSuggestion(i: number) {
    const s = suggestions()[i];
    if (s && s.url) {
      window.location.href = s.url;
    } else if (s && s.text) {
      setValue(s.text);
      inputRef?.focus();
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      if (suggestions().length) {
        setSelectedIndex((selectedIndex() + 1) % suggestions().length);
      }
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      if (suggestions().length) {
        setSelectedIndex((selectedIndex() - 1 + suggestions().length) % suggestions().length);
      }
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (selectedIndex() >= 0) {
        chooseSuggestion(selectedIndex());
        e.preventDefault();
      } else if (value().trim()) {
        window.location.href = `https://music.youtube.com/search?q=${encodeURIComponent(value().trim())}`;
      }
    } else if (e.key === 'Tab' || e.key === 'ArrowRight') {
      if (selectedIndex() >= 0 && suggestions()[selectedIndex()]) {
        setValue(suggestions()[selectedIndex()].text);
        inputRef?.focus();
        e.preventDefault();
      }
    }
  }

  onCleanup(() => {
    // Clean up if needed
  });

  return (
    <div
      ref={el => { barRef = el; syncDropdownWidth(); }}
      class="ytm-custom-search-bar"
      style={{
        display: 'flex',
        'align-items': 'center',
        background: '#181818',
        'border-radius': '10px',
        'box-shadow': isFocused() ? '0 0 0 2px #ff2d5522, 0 2px 8px #0002' : 'none',
        border: isFocused() ? '1.5px solid #ff2d55' : '1.5px solid #333',
        padding: '0 12px',
        height: '40px',
        'min-height': '40px',
        position: 'relative',
        width: 'min(480px, 40vw)',
        'max-width': '540px',
        'min-width': '320px',
        flex: '1 1 180px',
        margin: '0 16px',
        transition: 'border 0.15s, box-shadow 0.15s',
      } as JSX.CSSProperties}
    >
      <span style={{ 'margin-right': '8px' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </span>
      <input
        ref={el => { inputRef = el; syncDropdownWidth(); }}
        type="text"
        placeholder="What do you want to listen to?"
        value={value()}
        onInput={onInput}
        onKeyDown={onKeyDown}
        onFocus={() => setIsFocused(true)} // <-- Set focus
        onBlur={() => setIsFocused(false)} // <-- Unset focus
        style={{
          background: 'transparent',
          color: '#eee',
          border: 'none',
          outline: 'none',
          'font-size': '1.3em',
          'font-family': 'inherit',
          'box-shadow': 'none',
          padding: '0 8px',
          height: '40px',
          flex: '1',
        } as JSX.CSSProperties}
      />
      <div style={{ display: 'flex', 'align-items': 'center', gap: '0', 'margin-right': '8px' }}>
        <span style={{ display: 'inline-flex', 'justify-content': 'center', 'align-items': 'center', background: 'rgba(40,40,40,0.9)', border: '1px solid #888', 'border-radius': '6px', padding: '2px 8px', 'font-family': 'inherit', 'font-size': '0.95em', color: '#fff', 'box-shadow': '0 1px 2px #0003', 'vertical-align': 'middle' }}>Ctrl</span>
        <span style={{ margin: '0 4px', color: '#888', 'font-weight': 'bold', display: 'inline-flex', 'align-items': 'center' }}>+</span>
        <span style={{ display: 'inline-flex', 'justify-content': 'center', 'align-items': 'center', background: 'rgba(40,40,40,0.9)', border: '1px solid #888', 'border-radius': '6px', padding: '2px 8px', 'font-family': 'inherit', 'font-size': '0.95em', color: '#fff', 'box-shadow': '0 1px 2px #0003', 'vertical-align': 'middle' }}>K</span>
      </div>
      <Show when={suggestions().length}>
        <div
          ref={el => { suggestionBoxRef = el; syncDropdownWidth(); }}
          class="ytm-overlay-suggestion-scroll"
          style={{
            background: '#222',
            'border-radius': '6px',
            'margin-top': '4px',
            'box-shadow': '0 2px 16px #0007',
            display: 'block',
            position: 'absolute',
            left: '0',
            top: '100%',
            'z-index': '100000',
          } as JSX.CSSProperties}
        >
          <Index each={suggestions().slice(0, 5)}>{(s, i) => {
            const suggestion = s();
            if (!suggestion) return null;
            return (
              <div
                style={{
                  width: '100%',
                  'box-sizing': 'border-box',
                  display: 'flex',
                  'align-items': 'center',
                  padding: '10px 12px',
                  cursor: 'pointer',
                  background: i === selectedIndex() ? 'rgba(255,255,255,0.08)' : 'transparent',
                  'border-radius': '4px',
                  margin: '2px 0',
                  transition: 'background 0.15s',
                } as JSX.CSSProperties}
                onMouseEnter={() => setSelectedIndex(i)}
                onMouseLeave={() => setSelectedIndex(-1)}
                onMouseDown={e => { e.preventDefault(); chooseSuggestion(i); }}
              >
                {suggestion.icon ? (
                  <img src={suggestion.icon} style={{ width: '40px', height: '40px', 'object-fit': 'cover', 'border-radius': suggestion.type && suggestion.type.toLowerCase().includes('artist') ? '50%' : '4px', 'margin-right': '16px' }} />
                ) : (
                  <div style={{ width: '40px', height: '40px', 'margin-right': '16px', 'border-radius': suggestion.type && suggestion.type.toLowerCase().includes('artist') ? '50%' : '4px', background: '#333' }} />
                )}
                <div style={{ flex: '1', display: 'flex', 'flex-direction': 'column' }}>
                  <div style={{ 'font-weight': 500, 'font-size': '1.25em', color: '#fff' }}>{suggestion.text}</div>
                  {suggestion.subtitle && <div style={{ 'font-size': '1.1em', color: '#aaa', 'margin-top': '2px' }}>{suggestion.subtitle}</div>}
                </div>
                {suggestion.type && <span style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', 'font-size': '0.92em', padding: '2px 10px', 'border-radius': '6px', 'margin-left': '8px', 'font-weight': 400, 'letter-spacing': '0.03em', 'white-space': 'nowrap', 'max-width': '40%', 'overflow': 'hidden', 'text-overflow': 'ellipsis' }}>{suggestion.type}</span>}
              </div>
            );
          }}</Index>
        </div>
      </Show>
    </div>
  );
}
