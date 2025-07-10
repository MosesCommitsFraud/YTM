import style from './style.css?inline';
import { createPlugin } from '@/utils';

export default createPlugin({
  name: () => 'plugins.no-google-login.name',
  description: () => 'plugins.no-google-login.description',
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