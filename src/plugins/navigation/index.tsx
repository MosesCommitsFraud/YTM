import { render } from 'solid-js/web';

import style from './style.css?inline';
import { createPlugin } from '@/utils';


import { ForwardButton } from './components/forward-button';
import { BackButton } from './components/back-button';

export default createPlugin({
  name: () => 'Navigation',
  description: () => 'Provides navigation buttons for back and forward.',
  restartNeeded: false,
  config: {
    enabled: true,
  },
  stylesheets: [style],
  renderer: {
    buttonContainer: document.createElement('div'),
    start() {
      if (!this.buttonContainer) {
        this.buttonContainer = document.createElement('div');
      }

      render(
        () => (
          <>
            <BackButton
              onClick={() => history.back()}
              title="Go back"
            />
            <ForwardButton
              onClick={() => history.forward()}
              title="Go forward"
            />
          </>
        ),
        this.buttonContainer,
      );
    },
    stop() {
      if (this.buttonContainer) {
        this.buttonContainer.remove();
      }
    },
  },
});