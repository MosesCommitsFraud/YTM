import type { MenuItemConstructorOptions } from 'electron';
import type { MenuContext } from '@/types/contexts';
import type { SyncedLyricsPluginConfig } from './types';

export const menu = async (
  ctx: MenuContext<SyncedLyricsPluginConfig>,
): Promise<MenuItemConstructorOptions[]> => {
  const config = await ctx.getConfig();

  return [
    {
      label: 'Precise Timing',
      toolTip: 'Enable precise timing for lyrics',
      type: 'checkbox',
      checked: config.preciseTiming,
      click(item) {
        ctx.setConfig({
          preciseTiming: item.checked,
        });
      },
    },
    {
      label: 'Line Effect',
      toolTip: 'Choose how lyrics are displayed',
      type: 'submenu',
      submenu: [
        {
          label: 'Fancy',
          toolTip: 'Display lyrics with a fancy effect',
          type: 'radio',
          checked: config.lineEffect === 'fancy',
          click() {
            ctx.setConfig({
              lineEffect: 'fancy',
            });
          },
        },
        {
          label: 'Scale',
          toolTip: 'Display lyrics with a scale effect',
          type: 'radio',
          checked: config.lineEffect === 'scale',
          click() {
            ctx.setConfig({
              lineEffect: 'scale',
            });
          },
        },
        {
          label: 'Offset',
          toolTip: 'Display lyrics with an offset effect',
          type: 'radio',
          checked: config.lineEffect === 'offset',
          click() {
            ctx.setConfig({
              lineEffect: 'offset',
            });
          },
        },
        {
          label: 'Focus',
          toolTip: 'Display lyrics with a focus effect',
          type: 'radio',
          checked: config.lineEffect === 'focus',
          click() {
            ctx.setConfig({
              lineEffect: 'focus',
            });
          },
        },
      ],
    },
    {
      label: 'Default Text String',
      toolTip: 'Choose the default text string for lyrics',
      type: 'submenu',
      submenu: [
        {
          label: '♪',
          type: 'radio',
          checked: config.defaultTextString === '♪',
          click() {
            ctx.setConfig({
              defaultTextString: '♪',
            });
          },
        },
        {
          label: '" "',
          type: 'radio',
          checked: config.defaultTextString === ' ',
          click() {
            ctx.setConfig({
              defaultTextString: ' ',
            });
          },
        },
        {
          label: '...',
          type: 'radio',
          checked: config.defaultTextString === '...',
          click() {
            ctx.setConfig({
              defaultTextString: '...',
            });
          },
        },
        {
          label: '———',
          type: 'radio',
          checked: config.defaultTextString === '———',
          click() {
            ctx.setConfig({
              defaultTextString: '———',
            });
          },
        },
      ],
    },
    {
      label: 'Romanization',
      toolTip: 'Enable romanization for lyrics',
      type: 'checkbox',
      checked: config.romanization,
      click(item) {
        ctx.setConfig({
          romanization: item.checked,
        });
      },
    },
    {
      label: 'Show Time Codes',
      toolTip: 'Show time codes in lyrics',
      type: 'checkbox',
      checked: config.showTimeCodes,
      click(item) {
        ctx.setConfig({
          showTimeCodes: item.checked,
        });
      },
    },
    {
      label: 'Show Lyrics Even If Inexact',
      toolTip: 'Show lyrics even if the timing is not exact',
      type: 'checkbox',
      checked: config.showLyricsEvenIfInexact,
      click(item) {
        ctx.setConfig({
          showLyricsEvenIfInexact: item.checked,
        });
      },
    },
  ];
};
