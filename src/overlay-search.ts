// Floating overlay search bar for YouTube Music
// - Triggered by Ctrl+K
// - Dims background, centers search bar
// - Shows keycap shortcut visual
// - Fetches and displays suggestions in a dropdown

let overlay: HTMLDivElement | null = null;
let input: HTMLInputElement | null = null;
let suggestionBox: HTMLDivElement | null = null;
let suggestions: any[] = [];
let selectedIndex = -1;

function createKeycap(text: string) {
  const span = document.createElement('span');
  span.textContent = text;
  span.style.display = 'inline-flex';
  span.style.justifyContent = 'center';
  span.style.alignItems = 'center';
  span.style.background = 'rgba(40,40,40,0.9)';
  span.style.border = '1px solid #888';
  span.style.borderRadius = '6px'; // YT Music subtle roundness
  span.style.padding = '2px 8px';
  span.style.marginLeft = '0';
  span.style.fontFamily = 'inherit';
  span.style.fontSize = '0.95em';
  span.style.color = '#fff';
  span.style.boxShadow = '0 1px 2px #0003';
  span.style.verticalAlign = 'middle';
  return span;
}

// Inject custom scrollbar style for suggestionBox to match YTM
function injectScrollbarStyle() {
  if (document.getElementById('ytm-overlay-scrollbar-style')) return;
  const style = document.createElement('style');
  style.id = 'ytm-overlay-scrollbar-style';
  style.textContent = `
    .ytm-overlay-suggestion-scroll::-webkit-scrollbar {
      width: 10px;
      background: transparent;
    }
    .ytm-overlay-suggestion-scroll::-webkit-scrollbar-thumb {
      background: #333;
      border-radius: 8px;
      border: 2px solid #222;
      min-height: 32px;
      box-sizing: border-box;
    }
    .ytm-overlay-suggestion-scroll::-webkit-scrollbar-track {
      background: transparent;
      margin: 8px 0;
      border-radius: 12px;
    }
    .ytm-overlay-suggestion-scroll::-webkit-scrollbar-corner {
      background: transparent;
    }
  `;
  document.head.appendChild(style);
}

function showOverlaySearch() {
  if (overlay) return; // Already open

  injectScrollbarStyle();

  overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.background = 'rgba(0,0,0,0.65)';
  overlay.style.zIndex = '99999';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'flex-start';
  overlay.style.paddingTop = '10vh';

  // Search bar container
  const bar = document.createElement('div');
  bar.style.background = '#181818';
  bar.style.borderRadius = '10px'; // Match titlebar searchbar
  bar.style.border = '1.5px solid #333';
  bar.style.boxShadow = '0 4px 32px #000a';
  bar.style.display = 'flex';
  bar.style.alignItems = 'center';
  bar.style.padding = '0 12px';
  bar.style.height = '40px';
  bar.style.minHeight = '40px';
  bar.style.minWidth = '320px';
  bar.style.maxWidth = '540px';
  bar.style.width = 'min(480px, 40vw)';
  bar.style.position = 'relative';
  bar.style.flex = 'none';
  bar.style.transition = 'border 0.15s, box-shadow 0.15s';

  // Search icon
  const searchIcon = document.createElement('span');
  searchIcon.style.marginRight = '8px';
  searchIcon.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';

  // Input
  input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'What do you want to listen to?';
  input.style.background = 'transparent';
  input.style.border = 'none';
  input.style.outline = 'none';
  input.style.color = '#eee';
  input.style.fontSize = '1.3em';
  input.style.fontFamily = 'inherit';
  input.style.boxShadow = 'none';
  input.style.padding = '0 8px';
  input.style.height = '40px';
  input.style.flex = '1';
  input.style.minWidth = '0';

  // Add focus state handling
  const updateFocusState = (focused: boolean) => {
    if (focused) {
      bar.style.border = '1.5px solid #ff2d55';
      bar.style.boxShadow = '0 0 0 2px #ff2d5522, 0 2px 8px #0002';
    } else {
      bar.style.border = '1.5px solid #333';
      bar.style.boxShadow = '0 4px 32px #000a';
    }
  };

  // Keycap visual (Ctrl + K) to the right of the input
  const keycapRow = document.createElement('div');
  keycapRow.style.display = 'flex';
  keycapRow.style.alignItems = 'center';
  keycapRow.style.gap = '0';
  keycapRow.style.marginRight = '8px';
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

  // Assemble the bar
  bar.appendChild(searchIcon);
  bar.appendChild(input);
  bar.appendChild(keycapRow);

  // Legend row (keycap instructions)
  const legend = document.createElement('div');
  legend.style.display = 'flex';
  legend.style.alignItems = 'center';
  legend.style.gap = '16px';
  legend.style.margin = '18px 0 8px 0';
  legend.style.color = '#aaa';
  legend.style.fontSize = '1em';
  legend.style.fontWeight = '400';
  legend.style.userSelect = 'none';
  legend.style.justifyContent = 'center';

  // Helper to add a legend item
  function legendItem(keys: string[], label: string) {
    const wrap = document.createElement('span');
    wrap.style.display = 'inline-flex';
    wrap.style.alignItems = 'center';
    if (keys.length === 2 && keys[0] === '↑' && keys[1] === '↓') {
      // Special case: center plus between arrows
      const keycapUp = createKeycap('↑');
      const keycapDown = createKeycap('↓');
      const plus = document.createElement('span');
      plus.textContent = '+';
      plus.style.margin = '0 4px';
      plus.style.color = '#888';
      plus.style.fontWeight = 'bold';
      plus.style.display = 'inline-flex';
      plus.style.alignItems = 'center';
      wrap.appendChild(keycapUp);
      wrap.appendChild(plus);
      wrap.appendChild(keycapDown);
    } else {
      keys.forEach((k, i) => {
        wrap.appendChild(createKeycap(k));
        if (i < keys.length - 1) {
          const plus = document.createElement('span');
          plus.textContent = '+';
          plus.style.margin = '0 4px';
          plus.style.color = '#888';
          plus.style.fontWeight = 'bold';
          plus.style.display = 'inline-flex';
          plus.style.alignItems = 'center';
          wrap.appendChild(plus);
        }
      });
    }
    const txt = document.createElement('span');
    txt.textContent = ' ' + label;
    txt.style.marginLeft = '6px';
    txt.style.color = '#aaa';
    wrap.appendChild(txt);
    return wrap;
  }
  legend.appendChild(legendItem(['↑','↓'], 'Navigate'));
  legend.appendChild(legendItem(['Enter'], 'Open'));
  legend.appendChild(legendItem(['Esc'], 'Close'));

  // Suggestion dropdown
  suggestionBox = document.createElement('div');
  suggestionBox.className = 'ytm-overlay-suggestion-scroll';
  suggestionBox.style.background = '#222';
  suggestionBox.style.borderRadius = '6px';
  suggestionBox.style.marginTop = '4px';
  suggestionBox.style.boxShadow = '0 2px 16px #0007';
  suggestionBox.style.width = '100%';
  suggestionBox.style.display = 'none';
  suggestionBox.style.position = 'absolute';
  suggestionBox.style.left = '0';
  suggestionBox.style.top = '100%';
  suggestionBox.style.zIndex = '100000';
  suggestionBox.style.overflowY = 'auto';
  suggestionBox.style.maxHeight = '50vh';

  // Create a wrapper container for the search bar and suggestions
  const searchContainer = document.createElement('div');
  searchContainer.style.position = 'relative';
  searchContainer.style.display = 'flex';
  searchContainer.style.flexDirection = 'column';
  searchContainer.style.alignItems = 'center';
  
  searchContainer.appendChild(bar);
  searchContainer.appendChild(suggestionBox);
  
  overlay.appendChild(searchContainer);
  overlay.appendChild(legend);
  document.body.appendChild(overlay);

  setTimeout(() => input?.focus(), 10);

  // Event listeners
  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKeyDown);
  input.addEventListener('focus', () => updateFocusState(true));
  input.addEventListener('blur', () => updateFocusState(false));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      input?.blur();
      closeOverlay();
    }
  });
  document.addEventListener('keydown', onGlobalKeyDown, true);
}

function closeOverlay() {
  if (overlay) {
    overlay.remove();
    overlay = null;
    input = null;
    suggestionBox = null;
    suggestions = [];
    selectedIndex = -1;
    document.removeEventListener('keydown', onGlobalKeyDown, true);
  }
}

function onGlobalKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    closeOverlay();
  }
}

async function onInput() {
  const query = input?.value.trim();
  if (!query) {
    suggestionBox!.style.display = 'none';
    return;
  }
  // Fetch suggestions from YTM API
  const result = await fetchSuggestions(query);
  suggestions = result;
  renderSuggestions();
}

// Use proper YTM suggestions API
async function fetchSuggestions(query: string): Promise<Array<{text: string, url?: string, icon?: string, subtitle?: string, type?: string}>> {
  const app = document.querySelector('ytmusic-app');
  if (!app || !(app as any).networkManager) return [];
  
  let result: any;
  try {
    // Try to use the searchbox suggestions endpoint first
    result = await (app as any).networkManager.fetch('/searchbox', { query });
  } catch (e) {
    // Fallback to search endpoint but limit results
    try {
      result = await (app as any).networkManager.fetch('/search', { 
        query,
        params: 'Eg-KAQwIABAAGAEgACgAMABqChAEEAUQAxAKEAk%3D' // Limit to top results
      });
    } catch (e2) {
      return [];
    }
  }
  
  const suggestions: Array<{text: string, url?: string, icon?: string, subtitle?: string, type?: string}> = [];
  
  try {
    // Handle searchbox suggestions response
    if (result?.contents?.searchboxRenderer?.suggestions) {
      for (const suggestion of result.contents.searchboxRenderer.suggestions) {
        const text = suggestion.suggestion?.runs?.[0]?.text || '';
        if (text) {
          suggestions.push({ text, type: 'Search' });
        }
      }
    }
    // Handle search results as fallback
    else if (result?.contents?.tabbedSearchResultsRenderer?.tabs) {
      const tabs = result.contents.tabbedSearchResultsRenderer.tabs;
      for (const tab of tabs.slice(0, 1)) { // Only first tab to limit results
        const sectionList = tab.tabRenderer?.content?.sectionListRenderer;
        if (!sectionList) continue;
        for (const section of sectionList.contents?.slice(0, 2) || []) { // Limit sections
          if (section.musicShelfRenderer) {
            const type = section.musicShelfRenderer.title?.runs?.[0]?.text || '';
            for (const item of section.musicShelfRenderer.contents?.slice(0, 3) || []) { // Limit items
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
              if (text) {
                suggestions.push({ text, url, icon, subtitle, type });
              }
            }
          }
        }
      }
    }
  } catch (e) {
    // fallback: no suggestions
  }
  
  // Sort: artists first, then others, limit to 5 suggestions
  suggestions.sort((a, b) => {
    const aIsArtist = a.type && a.type.toLowerCase().includes('artist');
    const bIsArtist = b.type && b.type.toLowerCase().includes('artist');
    if (aIsArtist && !bIsArtist) return -1;
    if (!aIsArtist && bIsArtist) return 1;
    return 0;
  });
  
  return suggestions.slice(0, 5); // Limit to 5 suggestions
}

// Update renderSuggestions to use round icon for artists
function renderSuggestions() {
  suggestionBox!.innerHTML = '';
  if (!suggestions.length) {
    suggestionBox!.style.display = 'none';
    return;
  }
  suggestionBox!.style.display = 'block';
  suggestions.forEach((s, i) => {
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.padding = '10px 12px';
    item.style.cursor = 'pointer';
    item.style.background = i === selectedIndex ? 'rgba(255,255,255,0.08)' : 'transparent';
    item.style.borderRadius = '4px';
    item.style.margin = '2px 0';
    item.style.transition = 'background 0.15s';
    item.style.width = '100%';
    item.style.boxSizing = 'border-box';
    // Icon/thumbnail
    if (s.icon) {
      const img = document.createElement('img');
      img.src = s.icon;
      img.style.width = '40px';
      img.style.height = '40px';
      img.style.objectFit = 'cover';
      img.style.borderRadius = (s.type && s.type.toLowerCase().includes('artist')) ? '50%' : '4px';
      img.style.marginRight = '16px';
      item.appendChild(img);
    } else {
      const placeholder = document.createElement('div');
      placeholder.style.width = '40px';
      placeholder.style.height = '40px';
      placeholder.style.marginRight = '16px';
      placeholder.style.borderRadius = (s.type && s.type.toLowerCase().includes('artist')) ? '50%' : '4px';
      placeholder.style.background = '#333';
      item.appendChild(placeholder);
    }
    // Texts
    const textCol = document.createElement('div');
    textCol.style.flex = '1';
    textCol.style.display = 'flex';
    textCol.style.flexDirection = 'column';
    // Title
    const title = document.createElement('div');
    title.textContent = s.text;
    title.style.fontWeight = '500';
    title.style.fontSize = '1.25em'; // Match titlebar
    title.style.color = '#fff';
    textCol.appendChild(title);
    // Subtitle
    if (s.subtitle) {
      const subtitle = document.createElement('div');
      subtitle.textContent = s.subtitle;
      subtitle.style.fontSize = '1.1em'; // Match titlebar
      subtitle.style.color = '#aaa';
      subtitle.style.marginTop = '2px';
      textCol.appendChild(subtitle);
    }
    item.appendChild(textCol);
    // Type badge
    if (s.type) {
      const badge = document.createElement('span');
      badge.textContent = s.type;
      badge.style.background = 'rgba(255,255,255,0.12)';
      badge.style.color = '#fff';
      badge.style.fontSize = '0.92em';
      badge.style.padding = '2px 10px';
      badge.style.borderRadius = '6px';
      badge.style.marginLeft = '8px'; // Match titlebar
      badge.style.fontWeight = '400';
      badge.style.letterSpacing = '0.03em';
      badge.style.whiteSpace = 'nowrap';
      badge.style.maxWidth = '40%';
      badge.style.overflow = 'hidden';
      badge.style.textOverflow = 'ellipsis';
      item.appendChild(badge);
    }
    item.addEventListener('mouseenter', () => {
      selectedIndex = i;
      renderSuggestions();
    });
    item.addEventListener('mouseleave', () => {
      selectedIndex = -1;
      renderSuggestions();
    });
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      chooseSuggestion(i);
    });
    suggestionBox!.appendChild(item);
    // Scroll selected item into view if needed
    if (i === selectedIndex) {
      setTimeout(() => {
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 0);
    }
  });
}

// Only trigger navigation (and thus saving to recent searches) on Enter or suggestion click.
// Do NOT trigger navigation or search on input events.
function onKeyDown(e: KeyboardEvent) {
  // Handle Ctrl+A - let browser handle it naturally
  if (e.key === 'a' && e.ctrlKey) {
    // Don't interfere with browser's native select all behavior
    return;
  }
  
  if (e.key === 'Delete' && input && input.selectionStart === 0 && input.selectionEnd === input.value.length) {
    e.preventDefault();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    suggestionBox!.style.display = 'none';
    return;
  }
  
  if (!suggestions.length) return;
  if (e.key === 'ArrowDown') {
    selectedIndex = (selectedIndex + 1) % suggestions.length;
    renderSuggestions();
    e.preventDefault();
  } else if (e.key === 'ArrowUp') {
    selectedIndex = (selectedIndex - 1 + suggestions.length) % suggestions.length;
    renderSuggestions();
    e.preventDefault();
  } else if (e.key === 'Enter') {
    if (selectedIndex >= 0) {
      chooseSuggestion(selectedIndex);
      e.preventDefault();
    } else if (input && input.value.trim()) {
      // Instead of navigating directly, set the value of the main search bar and dispatch Enter
      const mainSearchBox = document.querySelector('ytmusic-search-box');
      let mainInput: HTMLInputElement | null = null;
      if (mainSearchBox) {
        if (mainSearchBox.shadowRoot) {
          mainInput = mainSearchBox.shadowRoot.querySelector('input');
        } else {
          mainInput = mainSearchBox.querySelector('input');
        }
      }
      if (mainInput) {
        mainInput.value = input.value.trim();
        // Dispatch input event so YTM updates its internal state
        mainInput.dispatchEvent(new Event('input', { bubbles: true }));
        // Dispatch Enter key event to trigger search and save to recents
        mainInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      } else {
        // fallback: submit search (will save to recents, but only once)
        window.location.href = `https://music.youtube.com/search?q=${encodeURIComponent(input.value.trim())}`;
      }
      closeOverlay();
      e.preventDefault();
    }
  }
}

function chooseSuggestion(i: number) {
  const s = suggestions[i];
  if (s && s.url) {
    // If suggestion has a URL, navigate directly
    window.location.href = s.url;
  } else if (s && s.text) {
    // If no URL, perform a search with the suggestion text
    window.location.href = `https://music.youtube.com/search?q=${encodeURIComponent(s.text)}`;
  }
  closeOverlay();
}

export { showOverlaySearch }; 