import { createPlugin } from "@/utils"
import { render } from "solid-js/web"

export default createPlugin({
  name: () => "Custom Spotify Player",
  description: () =>
    "A clean Spotifyinspired player with dark grey background and red accents, using official Material Design icons.",
  restartNeeded: false,
  config: {
    enabled: false,
  },
  renderer: {
    start() {
      // Add CSS to globally hide any remaining progress bar elements
      const hideProgressBarCSS = document.createElement('style');
      hideProgressBarCSS.id = 'ytmusic-custom-bar-overrides';
      hideProgressBarCSS.textContent = `
        /* Hide all possible progress bar elements */
        ytmusic-player-bar .progress-bar,
        ytmusic-player-bar .progress-info,
        ytmusic-player-bar .progress-wrapper,
        ytmusic-player-bar #progress-bar,
        ytmusic-player-bar .time-info,
        ytmusic-player-bar .sliders,
        ytmusic-player-bar .slider,
        ytmusic-player-bar .ytmusic-player-bar,
        ytmusic-player-bar tp-yt-paper-slider,
        ytmusic-player-bar [role="slider"],
        .ytmusic-player #progress-bar,
        .ytmusic-player .progress-bar,
        .ytmusic-player .sliders,
        .ytmusic-player .time-info,
        ytmusic-player-bar .time-display-wrapper,
        ytmusic-player-bar .time-display,
        ytmusic-player-bar .chapter-info,
        ytmusic-player-bar .ytp-time-display,
        .ytmusic-player-bar .progress-info,
        .progress-container,
        .progress-slider,
        #movie_player .ytp-progress-bar,
        #movie_player .ytp-time-display {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          height: 0 !important;
          pointer-events: none !important;
        }
        
        /* Ensure custom bar stays on top */
        #ytmusic-player-root {
          z-index: 2147483648 !important;
          pointer-events: auto !important;
        }
        
        /* Hide any hover effects from original progress area */
        ytmusic-player-bar:hover .progress-bar,
        ytmusic-player-bar:hover .progress-info,
        ytmusic-player-bar:hover .time-info {
          display: none !important;
          visibility: hidden !important;
        }
      `;
      document.head.appendChild(hideProgressBarCSS);

      // Only hide controls and progress bar in the default bar, not the album cover or song info
      const defaultBar = document.querySelector("ytmusic-player-bar")
      if (defaultBar) {
        // Hide controls with more comprehensive selectors
        const controlSelectors = [
          '.left-controls', '.center-controls', '.right-controls', '.middle-controls',
          '.player-controls', '.ytmusic-player-bar-controls', '.controls', 
          '.player-controls-wrapper', '.song-info .secondary-flex-columns',
          '.ytmusic-player-bar[slot="controls"]'
        ];
        
        controlSelectors.forEach(selector => {
          const elements = defaultBar.querySelectorAll(selector);
          elements.forEach(el => {
            (el as HTMLElement).style.display = "none";
            (el as HTMLElement).style.visibility = "hidden";
            (el as HTMLElement).style.opacity = "0";
          });
        });

        // Hide progress bar with more comprehensive selectors
        const progressSelectors = [
          '.progress-bar', '.player-progress-bar', '.progress', '.progress-info',
          '.progress-wrapper', '#progress-bar', '.time-info', '.sliders', '.slider',
          '.time-display-wrapper', '.time-display', '.chapter-info', 'tp-yt-paper-slider',
          '[role="slider"]', '.ytmusic-player-bar[slot="progress-bar"]', 
          '.ytmusic-player-bar-progress', '.progress-container', '.progress-slider'
        ];
        
        progressSelectors.forEach(selector => {
          const elements = defaultBar.querySelectorAll(selector);
          elements.forEach(el => {
            (el as HTMLElement).style.display = "none";
            (el as HTMLElement).style.visibility = "hidden";
            (el as HTMLElement).style.opacity = "0";
            (el as HTMLElement).style.height = "0";
            (el as HTMLElement).style.pointerEvents = "none";
          });
        });

        // Hide volume if present
        const volumeSelectors = [
          '.volume-slider', '.player-volume', '.volume', 
          '.ytmusic-player-bar[slot="volume"]'
        ];
        
        volumeSelectors.forEach(selector => {
          const elements = defaultBar.querySelectorAll(selector);
          elements.forEach(el => {
            (el as HTMLElement).style.display = "none";
            (el as HTMLElement).style.visibility = "hidden";
            (el as HTMLElement).style.opacity = "0";
          });
        });

        // Keep album cover and song info visible
        (defaultBar as HTMLElement).style.visibility = "visible";
        (defaultBar as HTMLElement).style.pointerEvents = "auto";
        (defaultBar as HTMLElement).style.opacity = "1";
        (defaultBar as HTMLElement).style.height = "";
      }

      // Additional check for any progress bars in the video player
      const moviePlayer = document.querySelector('#movie_player');
      if (moviePlayer) {
        const videoProgressSelectors = [
          '.ytp-progress-bar', '.ytp-time-display', '.ytp-progress-list'
        ];
        
        videoProgressSelectors.forEach(selector => {
          const elements = moviePlayer.querySelectorAll(selector);
          elements.forEach(el => {
            (el as HTMLElement).style.display = "none";
            (el as HTMLElement).style.visibility = "hidden";
            (el as HTMLElement).style.opacity = "0";
          });
        });
      }

      // Inject the custom bar
      let customBar = document.getElementById("ytmusic-player-root")
      if (!customBar) {
        customBar = document.createElement("div")
        customBar.id = "ytmusic-player-root"
        document.body.appendChild(customBar)
      }

      // Import and render the component
      import("./renderer").then(({ default: YTMusicPlayer }) => {
        render(YTMusicPlayer, customBar!)
      })

      // Monitor for dynamic content changes and re-hide progress bars
      const observer = new MutationObserver(() => {
        // Re-apply hiding to any new progress bar elements
        const allProgressSelectors = [
          'ytmusic-player-bar .progress-bar',
          'ytmusic-player-bar .progress-info',
          'ytmusic-player-bar .time-info',
          'ytmusic-player-bar .sliders',
          'ytmusic-player-bar tp-yt-paper-slider',
          '#movie_player .ytp-progress-bar'
        ];
        
        allProgressSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            (el as HTMLElement).style.display = "none";
            (el as HTMLElement).style.visibility = "hidden";
            (el as HTMLElement).style.opacity = "0";
            (el as HTMLElement).style.pointerEvents = "none";
          });
        });
      });
      
      observer.observe(document.body, { 
        childList: true, 
        subtree: true, 
        attributes: true,
        attributeFilter: ['style', 'class']
      });

      // Store observer for cleanup
      (window as any).ytmusicCustomBarObserver = observer;
    },
    stop() {
      // Remove the CSS overrides
      const hideProgressBarCSS = document.getElementById('ytmusic-custom-bar-overrides');
      if (hideProgressBarCSS) {
        hideProgressBarCSS.remove();
      }

      // Disconnect observer
      if ((window as any).ytmusicCustomBarObserver) {
        (window as any).ytmusicCustomBarObserver.disconnect();
        delete (window as any).ytmusicCustomBarObserver;
      }

      // Restore the default bar
      const defaultBar = document.querySelector("ytmusic-player-bar")
      if (defaultBar) {
        // Restore controls
        const controlSelectors = [
          '.left-controls', '.center-controls', '.right-controls', '.middle-controls',
          '.player-controls', '.ytmusic-player-bar-controls', '.controls', 
          '.player-controls-wrapper', '.ytmusic-player-bar[slot="controls"]'
        ];
        
        controlSelectors.forEach(selector => {
          const elements = defaultBar.querySelectorAll(selector);
          elements.forEach(el => {
            (el as HTMLElement).style.display = "";
            (el as HTMLElement).style.visibility = "";
            (el as HTMLElement).style.opacity = "";
          });
        });

        // Restore progress bar
        const progressSelectors = [
          '.progress-bar', '.player-progress-bar', '.progress', '.progress-info',
          '.time-info', '.sliders', '.ytmusic-player-bar[slot="progress-bar"]', 
          '.ytmusic-player-bar-progress'
        ];
        
        progressSelectors.forEach(selector => {
          const elements = defaultBar.querySelectorAll(selector);
          elements.forEach(el => {
            (el as HTMLElement).style.display = "";
            (el as HTMLElement).style.visibility = "";
            (el as HTMLElement).style.opacity = "";
            (el as HTMLElement).style.height = "";
            (el as HTMLElement).style.pointerEvents = "";
          });
        });

        // Restore volume if present
        const volumeSelectors = [
          '.volume-slider', '.player-volume', '.volume', 
          '.ytmusic-player-bar[slot="volume"]'
        ];
        
        volumeSelectors.forEach(selector => {
          const elements = defaultBar.querySelectorAll(selector);
          elements.forEach(el => {
            (el as HTMLElement).style.display = "";
            (el as HTMLElement).style.visibility = "";
            (el as HTMLElement).style.opacity = "";
          });
        });

        (defaultBar as HTMLElement).style.visibility = "";
        (defaultBar as HTMLElement).style.pointerEvents = "";
        (defaultBar as HTMLElement).style.opacity = "";
        (defaultBar as HTMLElement).style.height = "";
      }

      // Remove the custom bar
      const customBar = document.getElementById("ytmusic-player-root")
      if (customBar) {
        customBar.remove()
      }
    },
  },
})