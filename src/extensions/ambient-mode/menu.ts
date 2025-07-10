import { MenuItemConstructorOptions } from 'electron';

import { MenuContext } from '@/types/contexts';
import { AmbientModePluginConfig } from './types';

export interface menuParameters {
  getConfig: () => AmbientModePluginConfig | Promise<AmbientModePluginConfig>;
  setConfig: (
    conf: Partial<Omit<AmbientModePluginConfig, 'enabled'>>,
  ) => void | Promise<void>;
}

export const menu: (
  ctx: MenuContext<AmbientModePluginConfig>,
) =>
  | MenuItemConstructorOptions[]
  | Promise<MenuItemConstructorOptions[]> = async ({
  getConfig,
  setConfig,
}: menuParameters) => {
  const interpolationTimeList = [0, 500, 1000, 1500, 2000, 3000, 4000, 5000];
  const qualityList = [10, 25, 50, 100, 200, 500, 1000];
  const sizeList = [100, 110, 125, 150, 175, 200, 300];
  const bufferList = [1, 5, 10, 20, 30];
  const blurAmountList = [0, 5, 10, 25, 50, 100, 150, 200, 500];
  const opacityList = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

  const config = await getConfig();

  return [
    {
      label: 'Smoothness transition',
      submenu: interpolationTimeList.map((interpolationTime) => ({
        label: `During ${interpolationTime / 1000}s`,
        type: 'radio',
        checked: config.interpolationTime === interpolationTime,
        click() {
          setConfig({ interpolationTime });
        },
      })),
    },
    {
      label: 'Quality',
      submenu: qualityList.map((quality) => ({
        label: `${quality} pixels`,
        type: 'radio',
        checked: config.quality === quality,
        click() {
          setConfig({ quality });
        },
      })),
    },
    {
      label: 'Size',
      submenu: sizeList.map((size) => ({
        label: `${size}%`,
        type: 'radio',
        checked: config.size === size,
        click() {
          setConfig({ size });
        },
      })),
    },
    {
      label: 'Buffer',
      submenu: bufferList.map((buffer) => ({
        label: `${buffer}s`,
        type: 'radio',
        checked: config.buffer === buffer,
        click() {
          setConfig({ buffer });
        },
      })),
    },
    {
      label: 'Opacity',
      submenu: opacityList.map((opacity) => ({
        label: `${opacity * 100}%`,
        type: 'radio',
        checked: config.opacity === opacity,
        click() {
          setConfig({ opacity });
        },
      })),
    },
    {
      label: 'Blur amount',
      submenu: blurAmountList.map((blur) => ({
        label: `${blur}px`,
        type: 'radio',
        checked: config.blur === blur,
        click() {
          setConfig({ blur });
        },
      })),
    },
    {
      label: 'Use fullscreen',
      type: 'checkbox',
      checked: config.fullscreen,
      click(item: Electron.MenuItem) {
        setConfig({ fullscreen: item.checked });
      },
    },
  ];
};
