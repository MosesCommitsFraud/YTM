import prompt from 'custom-electron-prompt';

import { discordService } from './main';

import { singleton } from '@/providers/decorators';
import promptOptions from '@/providers/prompt-options';
import { setMenuOptions } from '@/config/plugins';

import type { MenuContext } from '@/types/contexts';
import type { DiscordPluginConfig } from './index';

import type { MenuTemplate } from '@/menu';

const registerRefreshOnce = singleton((refreshMenu: () => void) => {
  discordService?.registerRefreshCallback(refreshMenu);
});

export const onMenu = async ({
  window,
  getConfig,
  setConfig,
  refresh,
}: MenuContext<DiscordPluginConfig>): Promise<MenuTemplate> => {
  const config = await getConfig();
  registerRefreshOnce(refresh);

  return [
    {
      label: discordService?.isConnected()
        ? 'Connected'
        : 'Disconnected',
      enabled: !discordService?.isConnected(),
      click: () => discordService?.connect(true),
    },
    {
      label: 'Auto-reconnect',
      type: 'checkbox',
      checked: config.autoReconnect,
      click(item: Electron.MenuItem) {
        setConfig({
          autoReconnect: item.checked,
        });
      },
    },
    {
      label: 'Clear activity',
      click: () => discordService?.clearActivity(),
    },
    {
      label: 'Clear activity after timeout',
      type: 'checkbox',
      checked: config.activityTimeoutEnabled,
      click(item: Electron.MenuItem) {
        setConfig({
          activityTimeoutEnabled: item.checked,
        });
      },
    },
    {
      label: 'Play on YouTube Music',
      type: 'checkbox',
      checked: config.playOnYouTubeMusic,
      click(item: Electron.MenuItem) {
        setConfig({
          playOnYouTubeMusic: item.checked,
        });
      },
    },
    {
      label: 'Hide GitHub button',
      type: 'checkbox',
      checked: config.hideGitHubButton,
      click(item: Electron.MenuItem) {
        setConfig({
          hideGitHubButton: item.checked,
        });
      },
    },
    {
      label: 'Hide duration left',
      type: 'checkbox',
      checked: config.hideDurationLeft,
      click(item: Electron.MenuItem) {
        setConfig({
          hideDurationLeft: item.checked,
        });
      },
    },
    {
      label: 'Set inactivity timeout',
      click: () => setInactivityTimeout(window, config),
    },
  ];
};

async function setInactivityTimeout(
  win: Electron.BrowserWindow,
  options: DiscordPluginConfig,
) {
  const output = await prompt(
    {
      title: 'Set inactivity timeout',
      label: 'Set inactivity timeout',
      value: String(Math.round((options.activityTimeoutTime ?? 0) / 1e3)),
      type: 'counter',
      counterOptions: { minimum: 0, multiFire: true },
      width: 450,
      ...promptOptions(),
    },
    win,
  );

  if (output) {
    options.activityTimeoutTime = Math.round(~~output * 1e3);
    setMenuOptions('discord', options);
  }
}
