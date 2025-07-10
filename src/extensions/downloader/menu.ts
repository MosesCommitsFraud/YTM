import { dialog } from 'electron';
import prompt from 'custom-electron-prompt';
import { deepmerge } from 'deepmerge-ts';

import { downloadPlaylist } from './main';
import { getFolder } from './main/utils';
import { DefaultPresetList } from './types';

import promptOptions from '@/providers/prompt-options';

import { type DownloaderPluginConfig, defaultConfig } from './index';

import type { MenuContext } from '@/types/contexts';
import type { MenuTemplate } from '@/menu';

export const onMenu = async ({
  getConfig,
  setConfig,
}: MenuContext<DownloaderPluginConfig>): Promise<MenuTemplate> => {
  const config = await getConfig();

  return [
    {
      label: 'Download on finish settings',
      type: 'submenu',
      submenu: [
        {
          label: 'Enabled',
          type: 'checkbox',
          checked: config.downloadOnFinish?.enabled ?? false,
          click(item) {
            setConfig({
              downloadOnFinish: {
                ...deepmerge(
                  defaultConfig.downloadOnFinish,
                  config.downloadOnFinish,
                )!,
                enabled: item.checked,
              },
            });
          },
        },
        {
          type: 'separator',
        },
        {
          label: 'Choose download folder',
          click() {
            const result = dialog.showOpenDialogSync({
              properties: ['openDirectory', 'createDirectory'],
              defaultPath: getFolder(
                config.downloadOnFinish?.folder ?? config.downloadFolder,
              ),
            });
            if (result) {
              setConfig({
                downloadOnFinish: {
                  ...deepmerge(
                    defaultConfig.downloadOnFinish,
                    config.downloadOnFinish,
                  )!,
                  folder: result[0],
                },
              });
            }
          },
        },
        {
          label: 'Mode',
          type: 'submenu',
          submenu: [
            {
              label: 'Seconds',
              type: 'radio',
              checked: config.downloadOnFinish?.mode === 'seconds',
              click() {
                setConfig({
                  downloadOnFinish: {
                    ...deepmerge(
                      defaultConfig.downloadOnFinish,
                      config.downloadOnFinish,
                    )!,
                    mode: 'seconds',
                  },
                });
              },
            },
            {
              label: 'Percent',
              type: 'radio',
              checked: config.downloadOnFinish?.mode === 'percent',
              click() {
                setConfig({
                  downloadOnFinish: {
                    ...deepmerge(
                      defaultConfig.downloadOnFinish,
                      config.downloadOnFinish,
                    )!,
                    mode: 'percent',
                  },
                });
              },
            },
          ],
        },
        {
          label: 'Advanced',
          async click() {
            const res = await prompt({
              title: 'Download on finish settings',
              type: 'multiInput',
              multiInputOptions: [
                {
                  label: 'Last seconds',
                  inputAttrs: {
                    type: 'number',
                    required: true,
                    min: '0',
                    step: '1',
                  },
                  value:
                    config.downloadOnFinish?.seconds ??
                    defaultConfig.downloadOnFinish!.seconds,
                },
                {
                  label: 'Last percent',
                  inputAttrs: {
                    type: 'number',
                    required: true,
                    min: '1',
                    max: '100',
                    step: '1',
                  },
                  value:
                    config.downloadOnFinish?.percent ??
                    defaultConfig.downloadOnFinish!.percent,
                },
              ],
              ...promptOptions(),
              height: 240,
              resizable: true,
            }).catch(console.error);

            if (!res) {
              return undefined;
            }

            setConfig({
              downloadOnFinish: {
                ...deepmerge(
                  defaultConfig.downloadOnFinish,
                  config.downloadOnFinish,
                )!,
                seconds: Number(res[0]),
                percent: Number(res[1]),
              },
            });
            return;
          },
        },
      ],
    },

    {
      label: 'Download playlist',
      click: () => downloadPlaylist(),
    },
    {
      label: 'Choose download folder',
      click() {
        const result = dialog.showOpenDialogSync({
          properties: ['openDirectory', 'createDirectory'],
          defaultPath: getFolder(config.downloadFolder ?? ''),
        });
        if (result) {
          setConfig({ downloadFolder: result[0] });
        } // Else = user pressed cancel
      },
    },
    {
      label: 'Presets',
      submenu: Object.keys(DefaultPresetList).map((preset) => ({
        label: preset,
        type: 'radio',
        checked: config.selectedPreset === preset,
        click() {
          setConfig({ selectedPreset: preset });
        },
      })),
    },
    {
      label: 'Skip existing',
      type: 'checkbox',
      checked: config.skipExisting,
      click(item) {
        setConfig({ skipExisting: item.checked });
      },
    },
  ];
};
