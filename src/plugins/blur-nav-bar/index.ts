import { createPlugin } from '@/utils';

import style from './style.css?inline';

export default createPlugin({
  name: () => 'Blur Nav Bar',
  description: () => 'Blur the navigation bar for a modern look.',
  restartNeeded: false,
  renderer: {
    styleSheet: null as CSSStyleSheet | null,

    async start() {
      this.styleSheet = new CSSStyleSheet();
      await this.styleSheet.replace(style);

      document.adoptedStyleSheets = [
        ...document.adoptedStyleSheets,
        this.styleSheet,
      ];
    },
    async stop() {
      await this.styleSheet?.replace('');
    },
  },
});
