import prompt from 'custom-electron-prompt';

import promptOptions from '@/providers/prompt-options';

import { type AuthProxyConfig, defaultAuthProxyConfig } from './config';

import type { MenuContext } from '@/types/contexts';
import type { MenuTemplate } from '@/menu';

export const onMenu = async ({
  getConfig,
  setConfig,
  window,
}: MenuContext<AuthProxyConfig>): Promise<MenuTemplate> => {
  await getConfig();
  return [
    {
      label: 'Hostname',
      type: 'normal',
      async click() {
        const config = await getConfig();

        const newHostname =
          (await prompt(
            {
              title: 'Hostname',
              label: 'Hostname',
              value: config.hostname,
              type: 'input',
              width: 380,
              ...promptOptions(),
            },
            window,
          )) ??
          config.hostname ??
          defaultAuthProxyConfig.hostname;

        setConfig({ ...config, hostname: newHostname });
      },
    },
    {
      label: 'Port',
      type: 'normal',
      async click() {
        const config = await getConfig();

        const newPort =
          (await prompt(
            {
              title: 'Port',
              label: 'Port',
              value: config.port,
              type: 'counter',
              counterOptions: { minimum: 0, maximum: 65535 },
              width: 380,
              ...promptOptions(),
            },
            window,
          )) ??
          config.port ??
          defaultAuthProxyConfig.port;

        setConfig({ ...config, port: newPort });
      },
    },
  ];
};
