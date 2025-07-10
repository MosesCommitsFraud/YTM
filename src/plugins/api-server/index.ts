import { createPlugin } from '@/utils';

import { defaultAPIServerConfig } from './config';
import { onMenu } from './menu';
import { backend } from './backend';

export default createPlugin({
  name: () => 'API Server',
  description: () => 'Expose a local API for controlling playback.',
  restartNeeded: false,
  config: defaultAPIServerConfig,
  addedVersion: '3.6.X',
  menu: onMenu,

  backend,
});
