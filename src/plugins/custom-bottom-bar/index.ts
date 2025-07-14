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
      // Hide the default bottom bar
      const defaultBar = document.querySelector("ytmusic-player-bar, .player-bar, ytmusic-player")
      if (defaultBar) {
        ;(defaultBar as HTMLElement).style.visibility = "hidden"
        ;(defaultBar as HTMLElement).style.pointerEvents = "none"
        ;(defaultBar as HTMLElement).style.opacity = "0"
        ;(defaultBar as HTMLElement).style.height = "0"
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
      const defaultBar = document.querySelector("ytmusic-player-bar, .player-bar, ytmusic-player")
      if (defaultBar) {
        ;(defaultBar as HTMLElement).style.visibility = ""
        ;(defaultBar as HTMLElement).style.pointerEvents = ""
        ;(defaultBar as HTMLElement).style.opacity = ""
        ;(defaultBar as HTMLElement).style.height = ""
      }

      // Remove the custom bar
      const customBar = document.getElementById("ytmusic-player-root")
      if (customBar) {
        customBar.remove()
      }
    },
  },
})
