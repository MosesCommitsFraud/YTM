import { createPlugin } from '@/utils';

export default createPlugin({
  name: () => 'Always Expanded Sidebar',
  description: () => 'Keeps the YouTube Music sidebar always open and expanded.',
  restartNeeded: true,
  config: {
    enabled: true,
  },
  renderer() {
    // Add styling to hide the logo and close button, and adjust positioning
    const style = document.createElement('style');
    style.id = 'always-expanded-sidebar-style';
    style.textContent = `
      /* Hide only the header with logo and close button - multiple selectors for better coverage */
      tp-yt-app-drawer #header.tp-yt-app-drawer,
      tp-yt-app-drawer ytmusic-guide-renderer > #header,
      tp-yt-app-drawer ytmusic-guide-renderer > .header,
      tp-yt-app-drawer ytmusic-guide-renderer #header[slot="guide-content"],
      tp-yt-app-drawer div[slot="app-drawer"] #header {
        display: none !important;
        visibility: hidden !important;
        height: 0 !important;
        overflow: hidden !important;
        opacity: 0 !important;
      }

      /* Adjust sidebar content to account for top bar */
      tp-yt-app-drawer #contentContainer {
        padding-top: 64px !important;
      }

      /* Ensure the guide items are visible and start at the right position */
      tp-yt-app-drawer ytmusic-guide-renderer #items,
      tp-yt-app-drawer ytmusic-guide-renderer #contentContainer #items {
        padding-top: 0 !important;
      }
    `;

    // Insert the style as early as possible to prevent glitching
    if (document.head) {
      document.head.appendChild(style);
    } else {
      // If head doesn't exist yet, wait for it
      const observer = new MutationObserver(() => {
        if (document.head) {
          document.head.appendChild(style);
          observer.disconnect();
        }
      });
      observer.observe(document.documentElement, { childList: true });
    }

    // Function to ensure sidebar is always open
    const ensureSidebarOpen = () => {
      const appDrawer = document.querySelector('tp-yt-app-drawer');

      if (appDrawer) {
        // Check if sidebar is not open
        const isOpen = appDrawer.hasAttribute('opened');

        if (!isOpen) {
          // Open the sidebar and make it persistent
          appDrawer.setAttribute('opened', '');
          appDrawer.setAttribute('persistent', '');
        }
      }
    };

    // Open sidebar immediately
    ensureSidebarOpen();

    // Re-check after DOM is fully loaded
    setTimeout(ensureSidebarOpen, 100);
    setTimeout(ensureSidebarOpen, 500);
    setTimeout(ensureSidebarOpen, 1500);

    // Watch for DOM changes to keep the sidebar open if YouTube Music tries to close it
    const observer = new MutationObserver(() => {
      ensureSidebarOpen();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['opened', 'persistent'],
    });

    // Also listen for any clicks that might close the sidebar
    document.addEventListener('click', () => {
      setTimeout(ensureSidebarOpen, 50);
    }, true);

    return () => {
      observer.disconnect();
      // Remove the style element
      const styleElement = document.getElementById('always-expanded-sidebar-style');
      if (styleElement) {
        styleElement.remove();
      }
      // Optionally close the sidebar when plugin is disabled
      const appDrawer = document.querySelector('tp-yt-app-drawer');
      if (appDrawer) {
        appDrawer.removeAttribute('opened');
        appDrawer.removeAttribute('persistent');
      }
    };
  },
});
