import { createPlugin } from '@/utils';

export default createPlugin({
  name: () => 'Always Expanded Sidebar',
  description: () => 'Keeps the YouTube Music sidebar always open and expanded.',
  restartNeeded: false,
  config: {
    enabled: false,
  },
  renderer() {
    // Inject CSS to hide the guide button and logo
    const style = document.createElement('style');
    style.id = 'always-expanded-sidebar-style';
    style.textContent = `
      /* Hide the guide button and logo in the sidebar */
      ytmusic-guide-renderer #guide-button,
      ytmusic-guide-renderer ytmusic-logo {
        display: none !important;
      }

      /* Adjust spacing since header is hidden */
      ytmusic-guide-renderer .guide-nav {
        padding-top: 8px !important;
      }
    `;
    document.head.appendChild(style);

    // Function to open and persist the sidebar
    const openSidebar = () => {
      const appDrawer = document.querySelector('tp-yt-app-drawer');
      if (appDrawer) {
        appDrawer.setAttribute('opened', '');
        appDrawer.setAttribute('persistent', '');
      }
    };

    // Wait for the app to be ready, then open sidebar
    const checkAndOpen = () => {
      const appDrawer = document.querySelector('tp-yt-app-drawer');
      if (appDrawer) {
        openSidebar();

        // Watch for changes and keep it open
        const observer = new MutationObserver(openSidebar);
        observer.observe(appDrawer, {
          attributes: true,
          attributeFilter: ['opened', 'persistent'],
        });

        return observer;
      }
      return null;
    };

    // Try immediately
    let observer = checkAndOpen();

    // If not ready, wait for DOM
    if (!observer) {
      const initObserver = new MutationObserver(() => {
        observer = checkAndOpen();
        if (observer) {
          initObserver.disconnect();
        }
      });

      initObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      if (observer) observer.disconnect();
      style.remove();

      // Close sidebar when disabled
      const appDrawer = document.querySelector('tp-yt-app-drawer');
      if (appDrawer) {
        appDrawer.removeAttribute('opened');
        appDrawer.removeAttribute('persistent');
      }
    };
  },
});
