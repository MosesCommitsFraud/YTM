import { createPlugin } from '@/utils';

export default createPlugin({
  name: () => 'Always Expanded Sidebar',
  description: () => 'Forces the sidebar to always be expanded and visible.',
  restartNeeded: false,
  config: {
    enabled: true,
  },
  renderer() {
    // Add CSS to force the sidebar to always be visible
    const style = document.createElement('style');
    style.id = 'always-expanded-sidebar-style';
    style.textContent = `
      /* Force the app drawer (sidebar container) to always be open */
      ytmusic-app-layout tp-yt-app-drawer {
        --ytd-app-drawer-width: 240px !important;
      }

      /* Force the drawer to be opened */
      ytmusic-app-layout tp-yt-app-drawer[opened] {
        transform: translateX(0) !important;
      }

      /* Hide the mini/compact guide */
      #mini-guide {
        display: none !important;
      }

      /* Force the main guide renderer to be visible */
      ytmusic-guide-renderer {
        display: block !important;
        visibility: visible !important;
      }

      /* Ensure proper spacing for content when sidebar is visible */
      ytmusic-app-layout[has-persistent-guide_] #contentContainer {
        margin-left: 240px !important;
      }
    `;

    document.head.appendChild(style);

    // Function to ensure the sidebar is expanded
    const ensureSidebarExpanded = () => {
      // Get the app drawer element
      const appDrawer = document.querySelector('tp-yt-app-drawer');

      if (appDrawer) {
        // Force it to be opened
        appDrawer.setAttribute('opened', '');
        appDrawer.setAttribute('persistent', '');
      }

      // Check if we're in compact mode
      const miniGuide = document.querySelector('#mini-guide');
      const mainGuide = document.querySelector('ytmusic-guide-renderer');

      if (miniGuide && mainGuide) {
        const miniGuideStyle = window.getComputedStyle(miniGuide);
        const mainGuideStyle = window.getComputedStyle(mainGuide);

        // If mini guide is visible but main guide isn't, we need to toggle
        if (miniGuideStyle.display !== 'none' && mainGuideStyle.display === 'none') {
          // Look for the guide toggle button in multiple possible locations
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
      }
    };

    // Try to expand immediately
    ensureSidebarExpanded();

    // Try again after DOM is fully loaded
    setTimeout(ensureSidebarExpanded, 100);
    setTimeout(ensureSidebarExpanded, 500);
    setTimeout(ensureSidebarExpanded, 1500);
    setTimeout(ensureSidebarExpanded, 3000);

    // Watch for changes and re-expand if needed
    let debounceTimer: number | null = null;
    const observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(ensureSidebarExpanded, 100);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: false,
      attributes: true,
      attributeFilter: ['opened', 'persistent']
    });

    return () => {
      observer.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
      const styleElement = document.getElementById('always-expanded-sidebar-style');
      if (styleElement) {
        styleElement.remove();
      }
    };
  },
});
