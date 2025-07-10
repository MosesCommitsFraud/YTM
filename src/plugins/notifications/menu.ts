import is from 'electron-is';
import { MenuItem } from 'electron';

import { snakeToCamel, ToastStyles, urgencyLevels } from './utils';

import type { NotificationsPluginConfig } from './index';

import type { MenuTemplate } from '@/menu';
import type { MenuContext } from '@/types/contexts';

export const onMenu = async ({
  getConfig,
  setConfig,
}: MenuContext<NotificationsPluginConfig>): Promise<MenuTemplate> => {
  const config = await getConfig();

  const getToastStyleMenuItems = (options: NotificationsPluginConfig) => {
    const array = Array.from({ length: Object.keys(ToastStyles).length });

    // ToastStyles index starts from 1
    for (const [name, index] of Object.entries(ToastStyles)) {
      array[index - 1] = {
        label: snakeToCamel(name),
        type: 'radio',
        checked: options.toastStyle === index,
        click: () => setConfig({ toastStyle: index }),
      } satisfies Electron.MenuItemConstructorOptions;
    }

    return array as Electron.MenuItemConstructorOptions[];
  };

  const getMenu = (): MenuTemplate => {
    if (is.linux()) {
      return [
        {
          label: 'Priority',
          submenu: urgencyLevels.map((level) => ({
            label: level.name,
            type: 'radio',
            checked: config.urgency === level.value,
            click: () => setConfig({ urgency: level.value }),
          })),
        },
      ];
    } else if (is.windows()) {
      return [
        {
          label: 'Interactive',
          type: 'checkbox',
          checked: config.interactive,
          // Doesn't update until restart
          click: (item: MenuItem) => setConfig({ interactive: item.checked }),
        },
        {
          // Submenu with settings for interactive notifications (name shouldn't be too long)
          label: 'Interactive Settings',
          submenu: [
            {
              label: 'Tray Controls',
              type: 'checkbox',
              checked: config.trayControls,
              click: (item: MenuItem) =>
                setConfig({ trayControls: item.checked }),
            },
            {
              label: 'Hide Button Text',
              type: 'checkbox',
              checked: config.hideButtonText,
              click: (item: MenuItem) =>
                setConfig({ hideButtonText: item.checked }),
            },
            {
              label: 'Refresh on Play/Pause',
              type: 'checkbox',
              checked: config.refreshOnPlayPause,
              click: (item: MenuItem) =>
                setConfig({ refreshOnPlayPause: item.checked }),
            },
          ],
        },
        {
          label: 'Toast Style',
          submenu: getToastStyleMenuItems(config),
        },
      ];
    } else {
      return [];
    }
  };

  return [
    ...getMenu(),
    {
      label: 'Unpause Notification',
      type: 'checkbox',
      checked: config.unpauseNotification,
      click: (item) => setConfig({ unpauseNotification: item.checked }),
    },
  ];
};
