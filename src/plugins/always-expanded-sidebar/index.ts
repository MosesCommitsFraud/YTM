import { createPlugin } from '@/utils';

export default createPlugin({
  name: () => 'Sidebar Toggle Button',
  description: () => 'Adds a custom button above the home button to toggle the sidebar visibility.',
  restartNeeded: false,
  config: {
    enabled: true,
  },
  renderer() {
    // Create the toggle button element
    const toggleButton = document.createElement('div');
    toggleButton.className = 'style-scope ytmusic-pivot-bar-renderer navigation-item sidebar-toggle-button';
    toggleButton.setAttribute('role', 'tab');
    toggleButton.setAttribute('tab-id', 'sidebar_toggle');
    toggleButton.innerHTML = `
      <div
        aria-disabled="false"
        class="search-icon style-scope ytmusic-search-box"
        role="button"
        tabindex="0"
        title="Toggle Sidebar"
      >
        <div class="tab-icon style-scope paper-icon-button navigation-icon" id="icon">
          <svg
            class="style-scope iron-icon"
            preserveAspectRatio="xMidYMid meet"
            style="pointer-events: none; display: block; width: 100%; height: 100%;"
            viewBox="0 0 24 24"
          >
            <g class="style-scope iron-icon">
              <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"></path>
            </g>
          </svg>
        </div>
      </div>
    `;

    // Add styling for the button
    const style = document.createElement('style');
    style.id = 'sidebar-toggle-button-style';
    style.textContent = `
      .sidebar-toggle-button {
        font-family: Roboto, Noto Naskh Arabic UI, Arial, sans-serif;
        font-size: 20px;
        line-height: var(--ytmusic-title-1_-_line-height);
        font-weight: 500;
        --yt-endpoint-color: #fff;
        --yt-endpoint-hover-color: #fff;
        --yt-endpoint-visited-color: #fff;
        display: inline-flex;
        align-items: center;
        color: rgba(255, 255, 255, 0.5);
        cursor: pointer;
        margin: 0 var(--ytd-margin-2x, 8px);
      }

      .sidebar-toggle-button:hover {
        color: #fff;
      }

      .sidebar-toggle-button .navigation-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        position: relative;
        vertical-align: middle;
        fill: var(--iron-icon-fill-color, currentcolor);
        stroke: none;
        width: var(--iron-icon-width, 24px);
        height: var(--iron-icon-height, 24px);
        animation: var(--iron-icon_-_animation);
        padding: var(--ytd-margin-base, 4px) var(--ytd-margin-2x, 8px);
      }
    `;

    document.head.appendChild(style);

    // Function to toggle the sidebar
    const toggleSidebar = () => {
      const appDrawer = document.querySelector('tp-yt-app-drawer');
      const miniGuide = document.querySelector('#mini-guide');
      const mainGuide = document.querySelector('ytmusic-guide-renderer');

      if (appDrawer) {
        const isOpen = appDrawer.hasAttribute('opened');

        if (isOpen) {
          // Close the sidebar
          appDrawer.removeAttribute('opened');
          appDrawer.removeAttribute('persistent');
        } else {
          // Open the sidebar
          appDrawer.setAttribute('opened', '');
          appDrawer.setAttribute('persistent', '');
        }
      }

      // Toggle between mini and main guide if needed
      if (miniGuide && mainGuide) {
        // Find and click the guide toggle button
        const possibleSelectors = [
          'ytmusic-guide-button button',
          'ytmusic-pivot-bar-item-renderer[tab-id="FEmusic_guide"]',
          '#guide-button',
          'button[aria-label*="Guide" i]',
          'button[aria-label*="Menu" i]',
        ];

        for (const selector of possibleSelectors) {
          const button = document.querySelector<HTMLElement>(selector);
          if (button && button.offsetParent !== null) {
            button.click();
            break;
          }
        }
      }
    };

    // Add click event to the button
    toggleButton.addEventListener('click', toggleSidebar);

    // Function to insert the button into the pivot bar
    const insertToggleButton = () => {
      const pivotBar = document.querySelector('ytmusic-pivot-bar-renderer');
      const homeButton = document.querySelector('ytmusic-pivot-bar-item-renderer[tab-id="FEmusic_home"]');

      if (pivotBar && homeButton && !document.querySelector('.sidebar-toggle-button')) {
        // Insert before the home button
        pivotBar.insertBefore(toggleButton, homeButton);
      }
    };

    // Try to insert immediately
    insertToggleButton();

    // Try again after DOM is fully loaded
    setTimeout(insertToggleButton, 100);
    setTimeout(insertToggleButton, 500);
    setTimeout(insertToggleButton, 1500);

    // Watch for DOM changes to insert the button if it's removed or the pivot bar loads later
    const observer = new MutationObserver(() => {
      insertToggleButton();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      toggleButton.remove();
      const styleElement = document.getElementById('sidebar-toggle-button-style');
      if (styleElement) {
        styleElement.remove();
      }
    };
  },
});
