import style from './style.css?inline';
import { createPlugin } from '@/utils';

export default createPlugin({
  name: () => 'No Google Login',
  description: () => 'Removes the Google sign-in link from the YouTube Music navigation bar.',
  restartNeeded: true,
  config: {
    enabled: false,
  },
  stylesheets: [style],
  renderer() {
    const elementsToRemove = [
      '.sign-in-link.ytmusic-nav-bar',
      '.ytmusic-pivot-bar-renderer[tab-id="FEmusic_liked"]',
    ];

    for (const selector of elementsToRemove) {
      const node = document.querySelector(selector);
      if (node) {
        node.remove();
      }
    }
  },
});