import is from 'electron-is';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  Menu,
  MenuItem,
  shell,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import prompt from 'custom-electron-prompt';
import { satisfies } from 'semver';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { allPlugins } from 'virtual:plugins';

import config from './config';

import { restart } from './providers/app-controls';
import { startingPages } from './providers/extracted-data';
import promptOptions from './providers/prompt-options';

import { getAllMenuTemplate, loadAllMenuPlugins } from './loader/menu';

import packageJson from '../package.json';

export type MenuTemplate = Electron.MenuItemConstructorOptions[];

// True only if in-app-menu was loaded on launch
const inAppMenuActive = config.plugins.isEnabled('in-app-menu');

const pluginEnabledMenu = (
  plugin: string,
  label = '',
  description: string | undefined = undefined,
  isNew = false,
  hasSubmenu = false,
  refreshMenu: (() => void) | undefined = undefined,
): Electron.MenuItemConstructorOptions => ({
  label: label || plugin,
  sublabel: isNew ? 'New' : undefined,
  toolTip: description,
  type: 'checkbox',
  checked: config.plugins.isEnabled(plugin),
  click(item: Electron.MenuItem) {
    if (item.checked) {
      config.plugins.enable(plugin);
    } else {
      config.plugins.disable(plugin);
    }

    if (hasSubmenu) {
      refreshMenu?.();
    }
  },
});

export const refreshMenu = async (win: BrowserWindow) => {
  await setApplicationMenu(win);
  if (inAppMenuActive) {
    win.webContents.send('refresh-in-app-menu');
  }
};

export const mainMenuTemplate = async (
  win: BrowserWindow,
): Promise<MenuTemplate> => {
  const innerRefreshMenu = () => refreshMenu(win);
  const { navigationHistory } = win.webContents;
  await loadAllMenuPlugins(win);

  const menuResult = Object.entries(getAllMenuTemplate()).map(
    ([id, template]) => {
      const plugin = allPlugins[id];
      const pluginLabel = plugin?.name?.() ?? id;
      const pluginDescription = plugin?.description?.() ?? undefined;
      const isNew = plugin?.addedVersion
        ? satisfies(packageJson.version, plugin.addedVersion)
        : false;

      if (!config.plugins.isEnabled(id)) {
        return [
          id,
          pluginEnabledMenu(
            id,
            pluginLabel,
            pluginDescription,
            isNew,
            true,
            innerRefreshMenu,
          ),
        ] as const;
      }

      return [
        id,
        {
          label: pluginLabel,
          sublabel: isNew ? 'New' : undefined,
          toolTip: pluginDescription,
          submenu: [
            pluginEnabledMenu(
              id,
              'Enabled',
              undefined,
              false,
              true,
              innerRefreshMenu,
            ),
            { type: 'separator' },
            ...template,
          ],
        } satisfies Electron.MenuItemConstructorOptions,
      ] as const;
    },
  );

  const availablePlugins = Object.keys(allPlugins);
  const pluginMenus = availablePlugins
    .sort((a, b) => {
      const aPluginLabel = allPlugins[a]?.name?.() ?? a;
      const bPluginLabel = allPlugins[b]?.name?.() ?? b;

      return aPluginLabel.localeCompare(bPluginLabel);
    })
    .map((id) => {
      const predefinedTemplate = menuResult.find((it) => it[0] === id);
      if (predefinedTemplate) return predefinedTemplate[1];

      const plugin = allPlugins[id];
      const pluginLabel = plugin?.name?.() ?? id;
      const pluginDescription = plugin?.description?.() ?? undefined;
      const isNew = plugin?.addedVersion
        ? satisfies(packageJson.version, plugin.addedVersion)
        : false;

      return pluginEnabledMenu(
        id,
        pluginLabel,
        pluginDescription,
        isNew,
        true,
        innerRefreshMenu,
      );
    });

  return [
    {
      label: 'Plugins',
      submenu: pluginMenus,
    },
    {
      label: 'Options',
      submenu: [
        {
          label: 'Auto Update',
          type: 'checkbox',
          checked: config.get('options.autoUpdates'),
          click(item: MenuItem) {
            config.setMenuOption('options.autoUpdates', item.checked);
          },
        },
        {
          label: 'Resume on Start',
          type: 'checkbox',
          checked: config.get('options.resumeOnStart'),
          click(item: MenuItem) {
            config.setMenuOption('options.resumeOnStart', item.checked);
          },
        },
        {
          label: 'Starting Page',
          submenu: (() => {
            const subMenuArray: Electron.MenuItemConstructorOptions[] =
              Object.keys(startingPages).map((name) => ({
                label: name,
                type: 'radio',
                checked: config.get('options.startingPage') === name,
                click() {
                  config.set('options.startingPage', name);
                },
              }));
            subMenuArray.unshift({
              label: 'Unset',
              type: 'radio',
              checked: config.get('options.startingPage') === '',
              click() {
                config.set('options.startingPage', '');
              },
            });
            return subMenuArray;
          })(),
        },
        {
          label: 'Visual Tweaks',
          submenu: [
            {
              label: 'Remove Upgrade Button',
              type: 'checkbox',
              checked: config.get('options.removeUpgradeButton'),
              click(item: MenuItem) {
                config.setMenuOption(
                  'options.removeUpgradeButton',
                  item.checked,
                );
              },
            },
            {
              label: 'Like Buttons',
              submenu: [
                {
                  label: 'Default',
                  type: 'radio',
                  checked: !config.get('options.likeButtons'),
                  click() {
                    config.set('options.likeButtons', '');
                  },
                },
                {
                  label: 'Force Show',
                  type: 'radio',
                  checked: config.get('options.likeButtons') === 'force',
                  click() {
                    config.set('options.likeButtons', 'force');
                  },
                },
                {
                  label: 'Hide',
                  type: 'radio',
                  checked: config.get('options.likeButtons') === 'hide',
                  click() {
                    config.set('options.likeButtons', 'hide');
                  },
                },
              ],
            },
            {
              label: 'Theme',
              submenu: [
                ...((config.get('options.themes')?.length ?? 0) === 0
                  ? [
                      {
                        label: 'No Theme',
                      },
                    ]
                  : []),
                ...(config.get('options.themes')?.map((theme: string) => ({
                  type: 'normal' as const,
                  label: theme,
                  async click() {
                    const { response } = await dialog.showMessageBox(win, {
                      type: 'question',
                      defaultId: 1,
                      title: 'Remove Theme',
                      message: `Are you sure you want to remove the theme "${theme}"?`,
                      buttons: [
                        'Cancel',
                        'Remove',
                      ],
                    });

                    if (response === 1) {
                      config.set(
                        'options.themes',
                        config
                          .get('options.themes')
                          ?.filter((t) => t !== theme) ?? [],
                      );
                      innerRefreshMenu();
                    }
                  },
                })) ?? []),
                { type: 'separator' },
                {
                  label: 'Import CSS File',
                  type: 'normal',
                  async click() {
                    const { filePaths } = await dialog.showOpenDialog({
                      filters: [{ name: 'CSS Files', extensions: ['css'] }],
                      properties: ['openFile', 'multiSelections'],
                    });
                    if (filePaths) {
                      config.set('options.themes', filePaths);
                      innerRefreshMenu();
                    }
                  },
                },
              ],
            },
          ],
        },
        {
          label: 'Single Instance Lock',
          type: 'checkbox',
          checked: true,
          click(item: MenuItem) {
            if (!item.checked && app.hasSingleInstanceLock()) {
              app.releaseSingleInstanceLock();
            } else if (item.checked && !app.hasSingleInstanceLock()) {
              app.requestSingleInstanceLock();
            }
          },
        },
        {
          label: 'Always on Top',
          type: 'checkbox',
          checked: config.get('options.alwaysOnTop'),
          click(item: MenuItem) {
            config.setMenuOption('options.alwaysOnTop', item.checked);
            win.setAlwaysOnTop(item.checked);
          },
        },
        ...((is.windows() || is.linux()
          ? [
              {
                label: 'Hide Menu',
                type: 'checkbox',
                checked: config.get('options.hideMenu'),
                click(item) {
                  config.setMenuOption('options.hideMenu', item.checked);
                  if (item.checked && !config.get('options.hideMenuWarned')) {
                    dialog.showMessageBox(win, {
                      type: 'info',
                      title: 'Hide Menu',
                      message: 'This will hide the main menu bar. You can restore it in the settings.',
                    });
                  }
                },
              },
            ]
          : []) satisfies Electron.MenuItemConstructorOptions[]),
        ...((is.windows() || is.macOS()
          ? // Only works on Win/Mac
            // https://www.electronjs.org/docs/api/app#appsetloginitemsettingssettings-macos-windows
            [
              {
                label: 'Start at Login',
                type: 'checkbox',
                checked: config.get('options.startAtLogin'),
                click(item) {
                  config.setMenuOption('options.startAtLogin', item.checked);
                },
              },
            ]
          : []) satisfies Electron.MenuItemConstructorOptions[]),
        {
          label: 'Tray',
          submenu: [
            {
              label: 'Disabled',
              type: 'radio',
              checked: !config.get('options.tray'),
              click() {
                config.setMenuOption('options.tray', false);
                config.setMenuOption('options.appVisible', true);
              },
            },
            {
              label: 'Enabled and Show App',
              type: 'radio',
              checked:
                config.get('options.tray') && config.get('options.appVisible'),
              click() {
                config.setMenuOption('options.tray', true);
                config.setMenuOption('options.appVisible', true);
              },
            },
            {
              label: 'Enabled and Hide App',
              type: 'radio',
              checked:
                config.get('options.tray') && !config.get('options.appVisible'),
              click() {
                config.setMenuOption('options.tray', true);
                config.setMenuOption('options.appVisible', false);
              },
            },
            { type: 'separator' },
            {
              label: 'Play/Pause on Click',
              type: 'checkbox',
              checked: config.get('options.trayClickPlayPause'),
              click(item: MenuItem) {
                config.setMenuOption(
                  'options.trayClickPlayPause',
                  item.checked,
                );
              },
            },
          ],
        },
        {
          label: 'Advanced Options',
          submenu: [
            {
              label: 'Set Proxy',
              type: 'normal',
              async click(item: MenuItem) {
                await setProxy(item, win);
              },
            },
            {
              label: 'Override User Agent',
              type: 'checkbox',
              checked: config.get('options.overrideUserAgent'),
              click(item: MenuItem) {
                config.setMenuOption('options.overrideUserAgent', item.checked);
              },
            },
            {
              label: 'Disable Hardware Acceleration',
              type: 'checkbox',
              checked: config.get('options.disableHardwareAcceleration'),
              click(item: MenuItem) {
                config.setMenuOption(
                  'options.disableHardwareAcceleration',
                  item.checked,
                );
              },
            },
            {
              label: 'Restart on Config Changes',
              type: 'checkbox',
              checked: config.get('options.restartOnConfigChanges'),
              click(item: MenuItem) {
                config.setMenuOption(
                  'options.restartOnConfigChanges',
                  item.checked,
                );
              },
            },
            {
              label: 'Auto Reset App Cache',
              type: 'checkbox',
              checked: config.get('options.autoResetAppCache'),
              click(item: MenuItem) {
                config.setMenuOption('options.autoResetAppCache', item.checked);
              },
            },
            { type: 'separator' },
            is.macOS()
              ? {
                  label: 'Toggle Dev Tools',
                  // Cannot use "toggleDevTools" role in macOS
                  click() {
                    const { webContents } = win;
                    if (webContents.isDevToolsOpened()) {
                      webContents.closeDevTools();
                    } else {
                      webContents.openDevTools();
                    }
                  },
                }
              : {
                  label: 'Toggle Dev Tools',
                  role: 'toggleDevTools',
                },
            {
              label: 'Edit Config JSON',
              click() {
                config.edit();
              },
            },
          ],
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          role: 'reload',
        },
        {
          label: 'Force Reload',
          role: 'forceReload',
        },
        { type: 'separator' },
        {
          label: 'Zoom In',
          role: 'zoomIn',
          accelerator: 'CmdOrCtrl+=',
          visible: false,
        },
        {
          label: 'Zoom In',
          role: 'zoomIn',
          accelerator: 'CmdOrCtrl+Plus',
        },
        {
          label: 'Zoom Out',
          role: 'zoomOut',
          accelerator: 'CmdOrCtrl+-',
        },
        {
          label: 'Zoom Out',
          role: 'zoomOut',
          accelerator: 'CmdOrCtrl+Shift+-',
          visible: false,
        },
        {
          label: 'Reset Zoom',
          role: 'resetZoom',
        },
        { type: 'separator' },
        {
          label: 'Toggle Fullscreen',
          role: 'togglefullscreen',
        },
      ],
    },
    {
      label: 'Navigation',
      submenu: [
        {
          label: 'Go Back',
          click() {
            if (navigationHistory.canGoBack()) {
              navigationHistory.goBack();
            }
          },
        },
        {
          label: 'Go Forward',
          click() {
            if (navigationHistory.canGoForward()) {
              navigationHistory.goForward();
            }
          },
        },
        {
          label: 'Copy Current URL',
          click() {
            const currentURL = win.webContents.getURL();
            clipboard.writeText(currentURL);
          },
        },
        {
          label: 'Restart',
          click: restart,
        },
        {
          label: 'Quit',
          role: 'quit',
        },
      ],
    },
    {
      label: 'About',
      submenu: [
        {
          label: 'About YTM',
          click: async () => {
            const versions = process.versions;

            // Read the logo SVG and convert to base64 data URL
            let logoDataUrl = '';
            try {
              const logoPath = join(__dirname, '../assets/logo-white.svg');
              const logoSvg = readFileSync(logoPath, 'utf-8');
              logoDataUrl = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}`;
            } catch (e) {
              console.error('Failed to load logo:', e);
            }

            const aboutHtml = `
              <div style="text-align: center; padding: 20px 10px 10px 10px;">
                ${logoDataUrl ? `<img src="${logoDataUrl}" alt="YTM Logo" style="width: 80px; height: 80px; margin-bottom: 16px;" />` : ''}
                <h2 style="margin: 0 0 8px 0; color: #f1f1f1; font-size: 24px; font-weight: 500;">${packageJson.productName}</h2>
                <p style="margin: 0 0 20px 0; color: #888; font-size: 14px;">Version ${packageJson.version}</p>
              </div>
              <div style="padding: 0 20px 10px 20px;">
                <div style="background: rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 16px; margin-bottom: 12px;">
                  <div style="display: grid; grid-template-columns: auto 1fr; gap: 12px 16px; font-size: 13px;">
                    <span style="color: #888; font-weight: 500;">Electron:</span>
                    <span style="color: #f1f1f1;">${versions.electron}</span>
                    <span style="color: #888; font-weight: 500;">Chrome:</span>
                    <span style="color: #f1f1f1;">${versions.chrome}</span>
                    <span style="color: #888; font-weight: 500;">Node.js:</span>
                    <span style="color: #f1f1f1;">${versions.node}</span>
                    <span style="color: #888; font-weight: 500;">V8:</span>
                    <span style="color: #f1f1f1;">${versions.v8}</span>
                    <span style="color: #888; font-weight: 500;">Platform:</span>
                    <span style="color: #f1f1f1;">${process.platform} (${process.arch})</span>
                  </div>
                </div>
                <div style="text-align: center; padding-top: 8px;">
                  <a href="https://github.com/${packageJson.repository}"
                     style="color: #ff2d55; text-decoration: none; font-size: 13px; font-weight: 500; display: inline-flex; align-items: center; gap: 6px;"
                     onclick="require('electron').shell.openExternal('https://github.com/${packageJson.repository}'); return false;">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                    </svg>
                    View on GitHub
                  </a>
                </div>
              </div>
            `;

            await prompt(
              {
                title: `About ${packageJson.productName}`,
                label: aboutHtml,
                useHtmlLabel: true,
                type: 'input',
                height: 480,
                width: 480,
                buttonLabels: { ok: 'Close', cancel: undefined },
                inputAttrs: { type: 'hidden' } as Partial<HTMLInputElement>,
                ...promptOptions(),
              },
              win,
            );
          },
        },
        { type: 'separator' },
        {
          label: 'Check for Updates',
          click: (_, browserWindow) => {
            // Send checking message to renderer
            if (browserWindow) {
              browserWindow.webContents.send('checking-for-update-dialog');
            }

            // Perform update check
            autoUpdater.checkForUpdatesAndNotify().then((result) => {
              if (!result && browserWindow) {
                // No update available
                browserWindow.webContents.send('no-update-available-dialog', { version: packageJson.version });
              }
            }).catch((error) => {
              console.error('Manual update check failed:', error);
              if (browserWindow) {
                browserWindow.webContents.send('update-error-dialog', { message: error.message || 'An unknown error occurred.' });
              }
            });
          },
        },
      ],
    },
  ];
};
export const setApplicationMenu = async (win: Electron.BrowserWindow) => {
  const menuTemplate: MenuTemplate = [...(await mainMenuTemplate(win))];
  if (process.platform === 'darwin') {
    const { name } = app;
    menuTemplate.unshift({
      label: name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'selectAll' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { type: 'separator' },
        { role: 'minimize' },
        { role: 'close' },
        { role: 'quit' },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
};

async function setProxy(item: Electron.MenuItem, win: BrowserWindow) {
  const output = await prompt(
    {
      title: 'Set Proxy',
      label: 'Proxy URL',
      value: config.get('options.proxy'),
      type: 'input',
      inputAttrs: {
        type: 'url',
        placeholder: 'e.g., http://127.0.0.1:8080',
      },
      width: 450,
      ...promptOptions(),
    },
    win,
  );

  if (typeof output === 'string') {
    config.setMenuOption('options.proxy', output);
    item.checked = output !== '';
  } else {
    // User pressed cancel
    item.checked = !item.checked; // Reset checkbox
  }
}
