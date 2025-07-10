import prompt from 'custom-electron-prompt';

import promptOptions from '@/providers/prompt-options';

import {
  type APIServerConfig,
  AuthStrategy,
  defaultAPIServerConfig,
} from './config';

import type { MenuContext } from '@/types/contexts';
import type { MenuTemplate } from '@/menu';

export const onMenu = async ({
  getConfig,
  setConfig,
  window,
}: MenuContext<APIServerConfig>): Promise<MenuTemplate> => {
  const config = await getConfig();

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
          defaultAPIServerConfig.hostname;

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
              counterOptions: { minimum: 0, maximum: 65565 },
              width: 380,
              ...promptOptions(),
            },
            window,
          )) ??
          config.port ??
          defaultAPIServerConfig.port;

        setConfig({ ...config, port: newPort });
      },
    },
    {
      label: 'Auth Strategy',
      type: 'submenu',
      submenu: [
        {
          label: 'Auth at First',
          type: 'radio',
          checked: config.authStrategy === AuthStrategy.AUTH_AT_FIRST,
          click() {
            setConfig({ ...config, authStrategy: AuthStrategy.AUTH_AT_FIRST });
          },
        },
        {
          label: 'None',
          type: 'radio',
          checked: config.authStrategy === AuthStrategy.NONE,
          click() {
            setConfig({ ...config, authStrategy: AuthStrategy.NONE });
          },
        },
      ],
    },
  ];
};
