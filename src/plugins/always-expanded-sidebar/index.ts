import { webFrame, BrowserWindow } from 'electron';
import { createPlugin } from '@/utils';

export default createPlugin({
  name: () => 'Always Expanded Sidebar',
  description: () => 'Keeps the YouTube Music sidebar always open and expanded.',
  restartNeeded: true,
  config: {
    enabled: true,
  },
  backend({ ipc }) {
    let hasPerformedInitialReload = false;

    ipc.on('always-expanded-sidebar-force-reload', (event: Electron.IpcMainEvent) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !hasPerformedInitialReload) {
        hasPerformedInitialReload = true;
        win.webContents.reloadIgnoringCache();
      }
    });
  },
  preload: {
    start() {
      // Inject CSS and set up early hiding using executeJavaScript
      webFrame.executeJavaScript(`
        (function() {
          // Inject CSS immediately
          const injectCSS = () => {
            const style = document.createElement('style');
            style.id = 'always-expanded-sidebar-preload-style';
            style.textContent = \`
              ytmusic-nav-bar #guide-button,
              ytmusic-nav-bar yt-icon-button#guide-button,
              ytmusic-nav-bar ytmusic-logo {
                display: none !important;
                visibility: hidden !important;
                opacity: 0 !important;
              }
              tp-yt-app-drawer #contentContainer {
                padding-top: 64px !important;
              }
            \`;

            if (document.head) {
              document.head.appendChild(style);
            }
          };

          // Function to hide elements immediately
          const hideElements = () => {
            const navBar = document.querySelector('ytmusic-nav-bar');
            if (navBar) {
              const guideButton = navBar.querySelector('#guide-button');
              const logo = navBar.querySelector('ytmusic-logo');

              if (guideButton) guideButton.style.display = 'none';
              if (logo) logo.style.display = 'none';
            }
          };

          // Inject CSS as soon as possible
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', injectCSS);
          } else {
            injectCSS();
          }

          // Watch for elements and hide them immediately when they appear
          const observer = new MutationObserver(() => {
            hideElements();
          });

          // Start observing as soon as the document exists
          if (document.documentElement) {
            observer.observe(document.documentElement, {
              childList: true,
              subtree: true
            });
          }

          // Also hide immediately
          hideElements();

          // Keep trying to hide for the first few seconds
          setTimeout(hideElements, 10);
          setTimeout(hideElements, 50);
          setTimeout(hideElements, 100);
          setTimeout(hideElements, 200);
          setTimeout(hideElements, 500);
        })();
      `);
    },
  },
  renderer({ ipc }) {
    // Check if this is the first load after app start (not a manual reload)
    const hasReloaded = sessionStorage.getItem('always-expanded-sidebar-reloaded');

    if (!hasReloaded) {
      // Mark that we're about to reload
      sessionStorage.setItem('always-expanded-sidebar-reloaded', 'true');
      // Trigger a force reload via IPC (same as in-app menu)
      ipc.send('always-expanded-sidebar-force-reload');
      return () => {}; // Return early, don't set up anything else
    }

    // Inject CSS immediately (backup for preload)
    const style = document.createElement('style');
    style.id = 'always-expanded-sidebar-style';
    style.textContent = `
      /* Hide the guide button and logo in the top nav bar */
      ytmusic-nav-bar #guide-button,
      ytmusic-nav-bar ytmusic-logo {
        display: none !important;
      }

      /* Adjust sidebar content to account for top bar */
      tp-yt-app-drawer #contentContainer {
        padding-top: 64px !important;
      }
    `;

    if (document.head) {
      document.head.appendChild(style);
    }

    // Function to actively hide the guide button and logo
    const removeHeaderElements = () => {
      const navBar = document.querySelector('ytmusic-nav-bar');
      if (navBar) {
        const guideButton = navBar.querySelector('#guide-button');
        const logo = navBar.querySelector('ytmusic-logo');

        if (guideButton) {
          const htmlGuideButton = guideButton as HTMLElement;
          htmlGuideButton.style.display = 'none';
        }

        if (logo) {
          const htmlLogo = logo as HTMLElement;
          htmlLogo.style.display = 'none';
        }
      }
    };

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

      // Also remove header elements
      removeHeaderElements();
    };

    // Open sidebar and remove headers immediately
    ensureSidebarOpen();

    // Re-check after DOM is fully loaded
    setTimeout(ensureSidebarOpen, 100);
    setTimeout(ensureSidebarOpen, 500);
    setTimeout(ensureSidebarOpen, 1500);

    // Watch for DOM changes to keep the sidebar open and headers hidden
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

      // Clear the session storage flag so it can reload properly next time
      sessionStorage.removeItem('always-expanded-sidebar-reloaded');

      // Remove the style element
      const styleElement = document.getElementById('always-expanded-sidebar-style');
      if (styleElement) {
        styleElement.remove();
      }

      // Remove preload style if it exists
      const preloadStyle = document.getElementById('always-expanded-sidebar-preload-style');
      if (preloadStyle) {
        preloadStyle.remove();
      }

      // Close the sidebar when plugin is disabled
      const appDrawer = document.querySelector('tp-yt-app-drawer');
      if (appDrawer) {
        appDrawer.removeAttribute('opened');
        appDrawer.removeAttribute('persistent');
      }

      // Show the guide button and logo again
      const navBar = document.querySelector('ytmusic-nav-bar');
      if (navBar) {
        const guideButton = navBar.querySelector('#guide-button') as HTMLElement;
        const logo = navBar.querySelector('ytmusic-logo') as HTMLElement;

        if (guideButton) {
          guideButton.style.display = '';
        }

        if (logo) {
          logo.style.display = '';
        }
      }
    };
  },
});
