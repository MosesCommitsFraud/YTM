import { createPlugin } from '@/utils';
import { render } from 'solid-js/web';

export default createPlugin({
  name: () => 'Custom Bottom Bar',
  description: () => 'Replaces the default bottom bar with a custom one.',
  restartNeeded: false,
  config: {
    enabled: false,
  },
  renderer: {
    start() {
      // Hide the default bottom bar
      const defaultBar = document.querySelector("ytmusic-player-bar, .player-bar, ytmusic-player");
      if (defaultBar) {
        (defaultBar as HTMLElement).style.display = "none";
      }
      // Inject the custom bar
      let customBar = document.getElementById("custom-bottom-bar-root");
      if (!customBar) {
        customBar = document.createElement("div");
        customBar.id = "custom-bottom-bar-root";
        document.body.appendChild(customBar);
      }
      // Import and render the component
      import('./renderer').then(({ default: CustomBottomBar }) => {
        render(CustomBottomBar, customBar!);
      });
    },
    stop() {
      // Restore the default bar
      const defaultBar = document.querySelector("ytmusic-player-bar, .player-bar, ytmusic-player");
      if (defaultBar) {
        (defaultBar as HTMLElement).style.display = "";
      }
      // Remove the custom bar
      const customBar = document.getElementById("custom-bottom-bar-root");
      if (customBar) {
        customBar.remove();
      }
    },
  },
}); 