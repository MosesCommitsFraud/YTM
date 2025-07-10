import prompt from 'custom-electron-prompt';

import promptOptions from '@/providers/prompt-options';

import type { PictureInPicturePluginConfig } from './index';

import type { MenuContext } from '@/types/contexts';
import type { MenuTemplate } from '@/menu';

export const onMenu = async ({
  window,
  getConfig,
  setConfig,
}: MenuContext<PictureInPicturePluginConfig>): Promise<MenuTemplate> => {
  const config = await getConfig();

  return [
    {
      label: 'Always on top',
      type: 'checkbox',
      checked: config.alwaysOnTop,
      click(item) {
        setConfig({ alwaysOnTop: item.checked });
        window.setAlwaysOnTop(item.checked);
      },
    },
    {
      label: 'Save window position',
      type: 'checkbox',
      checked: config.savePosition,
      click(item) {
        setConfig({ savePosition: item.checked });
      },
    },
    {
      label: 'Save window size',
      type: 'checkbox',
      checked: config.saveSize,
      click(item) {
        setConfig({ saveSize: item.checked });
      },
    },
    {
      label: 'Hotkey',
      type: 'checkbox',
      checked: !!config.hotkey,
      async click(item) {
        const output = await prompt(
          {
            title: 'Set hotkey',
            label: 'Press the key combination you want to use for the hotkey.',
            type: 'keybind',
            keybindOptions: [
              {
                value: 'hotkey',
                label: 'Hotkey',
                default: config.hotkey,
              },
            ],
            ...promptOptions(),
          },
          window,
        );

        if (output) {
          const { value, accelerator } = output[0];
          setConfig({ [value]: accelerator });

          item.checked = !!accelerator;
        } else {
          // Reset checkbox if prompt was canceled
          item.checked = !item.checked;
        }
      },
    },
    {
      label: 'Use native PiP',
      type: 'checkbox',
      checked: config.useNativePiP,
      click(item) {
        setConfig({ useNativePiP: item.checked });
      },
    },
  ];
};
