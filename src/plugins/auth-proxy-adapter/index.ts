import { createPlugin } from '@/utils';

import { defaultAuthProxyConfig } from './config';
import { onMenu } from './menu';
import { backend } from './backend';

export default createPlugin({
  name: () => 'Auth Proxy Adapter',
  description: () => 'This plugin allows you to proxy authentication requests to an external authentication service.',
  restartNeeded: true,
  config: defaultAuthProxyConfig,
  addedVersion: '3.10.X',
  menu: onMenu,
  backend,
});
