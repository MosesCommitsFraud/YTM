import { createPlugin } from "@/utils"
import { render } from "solid-js/web"

export default createPlugin({
  name: () => "YouTube Music Player",
  description: () =>
    "A clean YouTube Music-inspired player with dark grey background and red accents, using official Material Design icons.",
  restartNeeded: false,
  config: {
    enabled: false,
  },
  renderer: {
    start() {
      // Only hide controls and progress bar in the default bar, not the album cover or song info
      const defaultBar = document.querySelector("ytmusic-player-bar")
      if (defaultBar) {
        // Hide controls
        const controls = defaultBar.querySelector('.left-controls, .center-controls, .right-controls, .middle-controls, .player-controls, .ytmusic-player-bar-controls, .ytmusic-player-bar[slot="controls"], .controls, .player-controls-wrapper');
        if (controls) (controls as HTMLElement).style.display = "none";
        // Hide progress bar
        const progress = defaultBar.querySelector('.progress-bar, .ytmusic-player-bar[slot="progress-bar"], .player-progress-bar, .progress, .ytmusic-player-bar-progress');
        if (progress) (progress as HTMLElement).style.display = "none";
        // Optionally hide volume if present
        const volume = defaultBar.querySelector('.volume-slider, .ytmusic-player-bar[slot="volume"], .player-volume, .volume');
        if (volume) (volume as HTMLElement).style.display = "none";
        // Keep album cover and song info visible
        (defaultBar as HTMLElement).style.visibility = "visible";
        (defaultBar as HTMLElement).style.pointerEvents = "auto";
        (defaultBar as HTMLElement).style.opacity = "1";
        (defaultBar as HTMLElement).style.height = "";
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
    },
    stop() {
      // Restore the default bar
      const defaultBar = document.querySelector("ytmusic-player-bar")
      if (defaultBar) {
        // Restore controls
        const controls = defaultBar.querySelector('.left-controls, .center-controls, .right-controls, .middle-controls, .player-controls, .ytmusic-player-bar-controls, .ytmusic-player-bar[slot="controls"], .controls, .player-controls-wrapper');
        if (controls) (controls as HTMLElement).style.display = "";
        // Restore progress bar
        const progress = defaultBar.querySelector('.progress-bar, .ytmusic-player-bar[slot="progress-bar"], .player-progress-bar, .progress, .ytmusic-player-bar-progress');
        if (progress) (progress as HTMLElement).style.display = "";
        // Restore volume if present
        const volume = defaultBar.querySelector('.volume-slider, .ytmusic-player-bar[slot="volume"], .player-volume, .volume');
        if (volume) (volume as HTMLElement).style.display = "";
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
