import path from 'node:path';
import url from 'node:url';
import fs from 'node:fs';

import {
  BrowserWindow,
  app,
  screen,
  globalShortcut,
  session,
  shell,
  dialog,
  ipcMain,
  protocol,
  type BrowserWindowConstructorOptions,
} from 'electron';
import { register } from 'electron-localshortcut';
import enhanceWebRequest, {
  BetterSession,
} from '@jellybrick/electron-better-web-request';
import is from 'electron-is';
import unhandled from 'electron-unhandled';
import { autoUpdater } from 'electron-updater';
import electronDebug from 'electron-debug';
import { parse } from 'node-html-parser';
import { deepmerge } from 'deepmerge-ts';
import { deepEqual } from 'fast-equals';

import { allPlugins, mainPlugins } from 'virtual:plugins';

import config from '@/config';

import { refreshMenu, setApplicationMenu } from '@/menu';
import { fileExists, injectCSS, injectCSSAsFile } from '@/plugins/utils/main';
import { isTesting } from '@/utils/testing';
import { setUpTray } from '@/tray';
import { setupSongInfo } from '@/providers/song-info';
import { restart, setupAppControls } from '@/providers/app-controls';
import {
  APP_PROTOCOL,
  handleProtocol,
  setupProtocolHandler,
} from '@/providers/protocol-handler';

import youtubeMusicCSS from '@/youtube-music.css?inline';

import {
  forceLoadMainPlugin,
  forceUnloadMainPlugin,
  getAllLoadedMainPlugins,
  loadAllMainPlugins,
} from '@/loader/main';

import { LoggerPrefix } from '@/utils';
// Remove: import { loadI18n, setLanguage, t } from '@/i18n';

import ErrorHtmlAsset from '@assets/error.html?asset';

import type { PluginConfig } from '@/types/plugins';

if (!is.macOS()) {
  delete allPlugins['touchbar'];
}
if (!is.windows()) {
  delete allPlugins['taskbar-mediacontrol'];
}

// Catch errors and log them
unhandled({
  logger: console.error,
  showDialog: false,
});

// Disable Node options if the env var is set
process.env.NODE_OPTIONS = '';

// Prevent window being garbage collected
let mainWindow: Electron.BrowserWindow | null;
let updateCheckInterval: NodeJS.Timeout | null = null;
autoUpdater.autoDownload = false;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.exit();
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'http',
    privileges: {
      standard: true,
      bypassCSP: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
    },
  },
  {
    scheme: 'https',
    privileges: {
      standard: true,
      bypassCSP: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
    },
  },
  { scheme: 'mailto', privileges: { standard: true } },
]);

// https://github.com/electron/electron/issues/46538#issuecomment-2808806722
if (is.linux()) {
  app.commandLine.appendSwitch('gtk-version', '3');
}

// Ozone platform hint: Required for Wayland support
app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
// SharedArrayBuffer: Required for downloader (@ffmpeg/core-mt)
// OverlayScrollbar: Required for overlay scrollbars
// UseOzonePlatform: Required for Wayland support
// WaylandWindowDecorations: Required for Wayland decorations
app.commandLine.appendSwitch(
  'enable-features',
  'OverlayScrollbar,SharedArrayBuffer,UseOzonePlatform,WaylandWindowDecorations',
);
if (config.get('options.disableHardwareAcceleration')) {
        if (is.dev()) {
        // Disabling hardware acceleration
      }

  app.disableHardwareAcceleration();
}

if (is.linux()) {
  // Overrides WM_CLASS for X11 to correspond to icon filename
  app.setName('com.github.th_ch.youtube_music');

  // Stops chromium from launching its own MPRIS service
  if (config.plugins.isEnabled('shortcuts')) {
    app.commandLine.appendSwitch('disable-features', 'MediaSessionService');
  }
}

if (config.get('options.proxy')) {
  let proxyToUse = '';
  if (config.get('options.proxy')) {
    // Use global proxy settings
    proxyToUse = config.get('options.proxy') || '';
  }

  app.commandLine.appendSwitch('proxy-server', proxyToUse);
}

// Adds debug features like hotkeys for triggering dev tools and reload
electronDebug({
  showDevTools: false, // Disable automatic devTools on new window
});

let icon = 'assets/youtube-music.png';
if (process.platform === 'win32') {
  icon = 'assets/generated/icon.ico';
} else if (process.platform === 'darwin') {
  icon = 'assets/generated/icon.icns';
}

function onClosed() {
  // Dereference the window
  // For multiple Windows store them in an array
  mainWindow = null;
}

ipcMain.handle('ytmd:get-main-plugin-names', () => Object.keys(mainPlugins));

const initHook = (win: BrowserWindow) => {
  ipcMain.handle(
    'ytmd:get-config',
    (_, id: string) =>
      deepmerge(
        allPlugins[id].config ?? { enabled: false },
        config.get(`plugins.${id}`) ?? {},
      ) as PluginConfig,
  );
  ipcMain.handle('ytmd:set-config', (_, name: string, obj: object) =>
    config.setPartial(`plugins.${name}`, obj, allPlugins[name].config),
  );

  config.watch((newValue, oldValue) => {
    const newPluginConfigList = (newValue?.plugins ?? {}) as Record<
      string,
      unknown
    >;
    const oldPluginConfigList = (oldValue?.plugins ?? {}) as Record<
      string,
      unknown
    >;

    Object.entries(newPluginConfigList).forEach(([id, newPluginConfig]) => {
      const isEqual = deepEqual(oldPluginConfigList[id], newPluginConfig);

      if (!isEqual) {
        const oldConfig = oldPluginConfigList[id] as PluginConfig;
        const config = deepmerge(
          allPlugins[id].config ?? { enabled: false },
          newPluginConfig ?? {},
        ) as PluginConfig;

        if (config.enabled !== oldConfig?.enabled) {
          if (config.enabled) {
            win.webContents.send('plugin:enable', id);
            ipcMain.emit('plugin:enable', id);
            forceLoadMainPlugin(id, win);
          } else {
            win.webContents.send('plugin:unload', id);
            ipcMain.emit('plugin:unload', id);
            forceUnloadMainPlugin(id, win);
          }

          if (allPlugins[id]?.restartNeeded) {
            showNeedToRestartDialog(id);
          }
        }

        const mainPlugin = getAllLoadedMainPlugins()[id];
        if (mainPlugin) {
          if (config.enabled && typeof mainPlugin.backend !== 'function') {
            mainPlugin.backend?.onConfigChange?.call(
              mainPlugin.backend,
              config,
            );
          }
        }

        win.webContents.send('config-changed', id, config);
      }
    });
  });
};

const showNeedToRestartDialog = (id: string) => {
  const plugin = allPlugins[id];

  const dialogOptions: Electron.MessageBoxOptions = {
    type: 'info',
    buttons: [
      'Restart Now',
      'Later',
    ],
    title: 'Need to Restart',
    message: `The plugin "${plugin?.name?.() ?? id}" needs to be restarted.`,
    detail: `The plugin "${plugin?.name?.() ?? id}" needs to be restarted.`,
    defaultId: 0,
    cancelId: 1,
  };

  let dialogPromise: Promise<Electron.MessageBoxReturnValue>;
  if (mainWindow) {
    dialogPromise = dialog.showMessageBox(mainWindow, dialogOptions);
  } else {
    dialogPromise = dialog.showMessageBox(dialogOptions);
  }

  dialogPromise.then((dialogOutput) => {
    switch (dialogOutput.response) {
      case 0: {
        restart();
        break;
      }

      // Ignore
      default: {
        break;
      }
    }
  });
};

function initTheme(win: BrowserWindow) {
  injectCSS(win.webContents, youtubeMusicCSS);
  // Load user CSS
  const themes: string[] = config.get('options.themes');
  if (Array.isArray(themes)) {
    for (const cssFile of themes) {
      fileExists(
        cssFile,
        () => {
          injectCSSAsFile(win.webContents, cssFile);
        },
        () => {
          console.warn(
            LoggerPrefix,
            `CSS file not found: ${cssFile}`,
          );
        },
      );
    }
  }

  win.webContents.once('did-finish-load', () => {
    if (is.dev()) {
      console.debug(LoggerPrefix, 'Dev tools opened');
      win.webContents.openDevTools();
    }
  });
}

async function createMainWindow() {
  const windowSize = config.get('window-size');
  const windowMaximized = config.get('window-maximized');
  const windowPosition: Electron.Point = config.get('window-position');
  const useInlineMenu = config.plugins.isEnabled('in-app-menu');

  const defaultTitleBarOverlayOptions: Electron.TitleBarOverlay = {
    color: '#00000000',
    symbolColor: '#ffffff',
    height: 32,
  };

  const decorations: Partial<BrowserWindowConstructorOptions> = {
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: useInlineMenu ? false : defaultTitleBarOverlayOptions,
    autoHideMenuBar: config.get('options.hideMenu'),
  };

  // Note: on linux, for some weird reason, having these extra properties with 'frame: false' does not work
  if (is.linux() && useInlineMenu) {
    delete decorations.titleBarOverlay;
    delete decorations.titleBarStyle;
  }

  const minWidth = 1100; // Minimum width for usability, can be adjusted
  const minHeight = 600;
  const win = new BrowserWindow({
    icon,
    width: windowSize.width,
    height: windowSize.height,
    minWidth,
    minHeight,
    backgroundColor: '#000',
    show: false,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      ...(isTesting()
        ? undefined
        : {
            // Sandbox is only enabled in tests for now
            // See https://www.electronjs.org/docs/latest/tutorial/sandbox#preload-scripts
            sandbox: false,
          }),
    },
    ...decorations,
  });
  initHook(win);
  initTheme(win);

  await loadAllMainPlugins(win);

  if (windowPosition) {
    const { x: windowX, y: windowY } = windowPosition;
    const winSize = win.getSize();
    const display = screen.getDisplayNearestPoint(windowPosition);
    const primaryDisplay = screen.getPrimaryDisplay();

    const scaleFactor = is.windows()
      ? primaryDisplay.scaleFactor / display.scaleFactor
      : 1;
    const scaledWidth = Math.floor(windowSize.width * scaleFactor);
    const scaledHeight = Math.floor(windowSize.height * scaleFactor);

    const scaledX = windowX;
    const scaledY = windowY;

    if (
      scaledX + scaledWidth / 2 < display.bounds.x - 8 || // Left
      scaledX + scaledWidth / 2 > display.bounds.x + display.bounds.width || // Right
      scaledY < display.bounds.y - 8 || // Top
      scaledY + scaledHeight / 2 > display.bounds.y + display.bounds.height // Bottom
    ) {
      // Window is offscreen
      if (is.dev()) {
        console.warn(
          LoggerPrefix,
          `Window tried to render offscreen: ${winSize}, ${JSON.stringify(display.bounds)}, ${JSON.stringify(windowPosition)}`,
        );
      }
    } else {
      win.setSize(scaledWidth, scaledHeight);
      win.setPosition(scaledX, scaledY);
    }
  }

  if (windowMaximized) {
    win.maximize();
  }

  if (config.get('options.alwaysOnTop')) {
    win.setAlwaysOnTop(true);
  }

  const urlToLoad = config.get('options.resumeOnStart')
    ? config.get('url')
    : config.defaultConfig.url;
  win.on('closed', onClosed);

  win.on('move', () => {
    if (win.isMaximized()) {
      return;
    }

    const [x, y] = win.getPosition();
    lateSave('window-position', { x, y });
  });

  let winWasMaximized: boolean;

  win.on('resize', () => {
    const [width, height] = win.getSize();
    const isMaximized = win.isMaximized();

    if (winWasMaximized !== isMaximized) {
      winWasMaximized = isMaximized;
      config.set('window-maximized', isMaximized);
    }

    if (isMaximized) {
      return;
    }

    lateSave('window-size', {
      width,
      height,
    });
  });

  const savedTimeouts: Record<string, NodeJS.Timeout | undefined> = {};

  function lateSave(
    key: string,
    value: unknown,
    fn: (key: string, value: unknown) => void = config.set,
  ) {
    if (savedTimeouts[key]) {
      clearTimeout(savedTimeouts[key]);
    }

    savedTimeouts[key] = setTimeout(() => {
      fn(key, value);
      savedTimeouts[key] = undefined;
    }, 600);
  }

  app.on('render-process-gone', (_event, _webContents, details) => {
    showUnresponsiveDialog(win, details);
  });

  win.once('ready-to-show', () => {
    if (config.get('options.appVisible')) {
      win.show();
    }
  });

  removeContentSecurityPolicy();

  win.webContents.on('dom-ready', () => {
    // Custom window controls are now handled entirely by the in-app-menu plugin
    // No need to set titleBarOverlay when using custom controls
  });
  win.webContents.on('will-redirect', (event) => {
    const url = new URL(event.url);

    // Workarounds for regions where YTM is restricted
    if (url.hostname.endsWith('youtube.com') && url.pathname === '/premium') {
      event.preventDefault();

      win.webContents.loadURL(
        'https://accounts.google.com/ServiceLogin?ltmpl=music&service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2Fsignin%3Faction_handle_signin%3Dtrue%26next%3Dhttps%253A%252F%252Fmusic.youtube.com%252F',
      );
    }
  });

  win.webContents.loadURL(urlToLoad);

  return win;
}

app.once('browser-window-created', (_event, win) => {
  if (config.get('options.overrideUserAgent')) {
    // User agents are from https://developers.whatismybrowser.com/useragents/explore/
    const originalUserAgent = win.webContents.userAgent;
    const userAgents = {
      mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.152 Safari/537.36',
      windows:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.152 Safari/537.36',
      linux:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.152 Safari/537.36',
    };

    const updatedUserAgent = is.macOS()
      ? userAgents.mac
      : is.windows()
        ? userAgents.windows
        : userAgents.linux;

    win.webContents.userAgent = updatedUserAgent;
    app.userAgentFallback = updatedUserAgent;

    win.webContents.session.webRequest.onBeforeSendHeaders((details, cb) => {
      // This will only happen if login failed, and "retry" was pressed
      if (
        win.webContents.getURL().startsWith('https://accounts.google.com') &&
        details.url.startsWith('https://accounts.google.com')
      ) {
        details.requestHeaders['User-Agent'] = originalUserAgent;
      }

      cb({ requestHeaders: details.requestHeaders });
    });
  }

  setupSongInfo(win);
  setupAppControls();

  win.webContents.on(
    'did-fail-load',
    (
      _event,
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame,
      frameProcessId,
      frameRoutingId,
    ) => {
      const log = JSON.stringify(
        {
          error: 'did-fail-load',
          errorCode,
          errorDescription,
          validatedURL,
          isMainFrame,
          frameProcessId,
          frameRoutingId,
        },
        null,
        '\t',
      );
      if (is.dev()) {
        // Log error details
      }

      if (
        errorCode !== -3 &&
        // Workaround for #2435
        !new URL(validatedURL).hostname.includes('doubleclick.net')
      ) {
        // -3 is a false positive
        win.webContents.send('log', log);
        win.webContents.loadFile(ErrorHtmlAsset);
      }
    },
  );

  win.webContents.on('will-prevent-unload', (event) => {
    event.preventDefault();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }

  // Unregister all shortcuts.
  globalShortcut.unregisterAll();
});

app.on('activate', async () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    mainWindow = await createMainWindow();
  } else if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
});

app.whenReady().then(async () => {
  // Language/i18n support removed; no language initialization needed
  if (config.get('options.autoResetAppCache')) {
    // Clear cache after 20s
    const clearCacheTimeout = setTimeout(() => {
      if (is.dev()) {
        // Clearing cache after 20s
      }
      session.defaultSession.clearCache();
      clearTimeout(clearCacheTimeout);
    }, 20_000);
  }
  // Register appID on windows
  if (is.windows()) {
    const appID = 'com.github.th-ch.youtube-music';
    app.setAppUserModelId(appID);
    const appLocation = process.execPath;
    const appData = app.getPath('appData');
    // Check shortcut validity if not in dev mode / running portable app
    if (
      !is.dev() &&
      !appLocation.startsWith(path.join(appData, '..', 'Local', 'Temp'))
    ) {
      const shortcutPath = path.join(
        appData,
        'Microsoft',
        'Windows',
        'Start Menu',
        'Programs',
        'YouTube Music.lnk',
      );
      try {
        // Check if shortcut is registered and valid
        const shortcutDetails = shell.readShortcutLink(shortcutPath); // Throw error if it doesn't exist yet
        if (
          shortcutDetails.target !== appLocation ||
          shortcutDetails.appUserModelId !== appID
        ) {
          // eslint-disable-next-line @typescript-eslint/only-throw-error
          throw 'needUpdate';
        }
      } catch (error) {
        // If not valid -> Register shortcut
        shell.writeShortcutLink(
          shortcutPath,
          error === 'needUpdate' ? 'update' : 'create',
          {
            target: appLocation,
            cwd: path.dirname(appLocation),
            description: 'YouTube Music Desktop App - including custom plugins',
            appUserModelId: appID,
          },
        );
      }
    }
  }
  ipcMain.on('get-renderer-script', (event) => {
    // Inject index.html file as string using insertAdjacentHTML
    // In dev mode, get string from process.env.VITE_DEV_SERVER_URL, else use fs.readFileSync
    if (is.dev() && process.env.ELECTRON_RENDERER_URL) {
      // HACK: to make vite work with electron renderer (supports hot reload)
      event.returnValue = [
        null,
        `

        (async () => {
          await new Promise((resolve) => {
            if (document.readyState === 'loading') {

              document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
            } else {
              resolve();
            }
          });
          const viteScript = document.createElement('script');
          viteScript.type = 'module';
          viteScript.src = '${process.env.ELECTRON_RENDERER_URL}/@vite/client';
          const rendererScript = document.createElement('script');
          rendererScript.type = 'module';
          rendererScript.src = '${process.env.ELECTRON_RENDERER_URL}/renderer.ts';
          document.body.appendChild(viteScript);
          document.body.appendChild(rendererScript);
        })();
        0
      `,
      ];
    } else {
      const rendererPath: string = path.join(__dirname, '..', 'renderer');
      const indexHTMLPath: string = path.join(rendererPath, 'index.html');
      if (!fs.existsSync(indexHTMLPath)) {
        event.returnValue = ['', ''];
        return;
      }
      const indexHTML = parse(fs.readFileSync(indexHTMLPath, 'utf-8'));
      const scriptSrc = indexHTML.querySelector('script');
      const scriptAttrStr = String(scriptSrc?.getAttribute('src') ?? '');
      const scriptPath = path.join(rendererPath, scriptAttrStr);
      const scriptString = scriptPath ? fs.readFileSync(scriptPath, 'utf-8') : '';
      event.returnValue = [
        scriptPath ? url.pathToFileURL(scriptPath).toString() : '',
        scriptString + ';0',
      ];
    }
  });
  mainWindow = await createMainWindow();
  await setApplicationMenu(mainWindow);
  await refreshMenu(mainWindow);
  setUpTray(app, mainWindow);
  
  // Global F3 hotkey to enable in-app menu plugin even when disabled
  register(mainWindow, 'F3', () => {
    const win = mainWindow;
    if (!win) return;
    const isEnabled = config.plugins.isEnabled('in-app-menu');
    if (!isEnabled) {
      config.plugins.enable('in-app-menu');
      // The plugin requires a restart, so show a dialog
      dialog.showMessageBox(win, {
        type: 'info',
        title: 'In-App Menu Enabled',
        message: 'The in-app menu has been enabled. The application will restart to apply changes.',
        buttons: ['Restart Now', 'Restart Later'],
        defaultId: 0,
      }).then((result) => {
        if (result.response === 0) {
          restart();
        }
      });
    } else {
      // If already enabled, just toggle the menu visibility
      win.webContents.send('toggle-in-app-menu');
    }
  });
  setupProtocolHandler(mainWindow);
  app.on('second-instance', (_, commandLine) => {
    const uri = `${APP_PROTOCOL}://`;
    const protocolArgv = commandLine.find((arg) => arg.startsWith(uri));
    if (protocolArgv) {
      const lastIndex = protocolArgv.endsWith('/') ? -1 : undefined;
      const command = protocolArgv.slice(uri.length, lastIndex);
      if (is.dev()) {
        console.debug(
          LoggerPrefix,
          'Received command', { command },
        );
      }
      const splited = decodeURIComponent(command).split(' ');
      const cmd = splited.shift();
      if (cmd) {
        handleProtocol(cmd, ...splited);
      }
      return;
    }
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow.focus();
  });
  // Autostart at login
  app.setLoginItemSettings({
    openAtLogin: config.get('options.startAtLogin'),
  });
  // Auto-update check using GitHub releases for MosesCommitsFraud/YTM
  if (!is.dev()) {
    setupAutoUpdater();
  }
});

function setupAutoUpdater() {
  // Set up the update-available event handler
  autoUpdater.on('update-available', () => {
    const downloadLink =
      'https://github.com/MosesCommitsFraud/YTM/releases/latest';
    const dialogOptions = {
      type: 'info' as const,
      buttons: [
        'OK',
        'Download',
        'Disable',
      ],
      title: 'Update Available',
      message: 'A new update is available.',
    };
    
    const handleDialogResult = (result: Electron.MessageBoxReturnValue) => {
      if (result.response === 1) {
        shell.openExternal(downloadLink);
      } else if (result.response === 2) {
        config.set('options.autoUpdates', false);
        // The config watcher will handle stopping the interval
      }
    };

    if (mainWindow) {
      dialog.showMessageBox(mainWindow, dialogOptions).then(handleDialogResult);
    } else {
      dialog.showMessageBox(dialogOptions).then(handleDialogResult);
    }
  });

  // Function to perform update check
  const checkForUpdates = () => {
    // Only check if auto-updates are still enabled
    if (config.get('options.autoUpdates')) {
      autoUpdater.checkForUpdatesAndNotify();
    }
  };

  // Function to start the update interval
  const startUpdateInterval = () => {
    if (updateCheckInterval) {
      clearInterval(updateCheckInterval);
    }
    updateCheckInterval = setInterval(checkForUpdates, 30 * 60 * 1000);
  };

  // Function to stop the update interval
  const stopUpdateInterval = () => {
    if (updateCheckInterval) {
      clearInterval(updateCheckInterval);
      updateCheckInterval = null;
    }
  };

  // Only perform initial check and start interval if auto-updates are enabled
  if (config.get('options.autoUpdates')) {
    // Initial check after 2 seconds (same as before)
    setTimeout(checkForUpdates, 2000);

    // Set up recurring checks every 30 minutes (30 * 60 * 1000 ms)
    startUpdateInterval();
  }

  // Watch for changes to the autoUpdates setting
  config.watch((newValue, oldValue) => {
    const newOptions = (newValue?.options ?? {}) as { autoUpdates?: boolean };
    const oldOptions = (oldValue?.options ?? {}) as { autoUpdates?: boolean };
    
    const newAutoUpdates = newOptions.autoUpdates ?? false;
    const oldAutoUpdates = oldOptions.autoUpdates ?? false;

    if (newAutoUpdates !== oldAutoUpdates) {
      if (newAutoUpdates) {
        // Auto-updates were enabled, start the interval
        startUpdateInterval();
      } else {
        // Auto-updates were disabled, stop the interval
        stopUpdateInterval();
      }
    }
  });

  // Clean up interval when app is about to quit
  app.on('before-quit', () => {
    stopUpdateInterval();
  });
}

function showUnresponsiveDialog(
  win: BrowserWindow,
  details: Electron.RenderProcessGoneDetails,
) {
  if (details) {
    console.error(
      LoggerPrefix,
      `Unresponsive details: ${JSON.stringify(details, null, '\t')}`,
    );
  }

  dialog
    .showMessageBox(win, {
      type: 'error',
      title: 'Unresponsive',
      message: 'The application is unresponsive. What would you like to do?',
      detail: 'The application is unresponsive. What would you like to do?',
      buttons: [
        'Wait',
        'Relaunch',
        'Quit',
      ],
      cancelId: 0,
    })
    .then((result) => {
      switch (result.response) {
        case 1: {
          restart();
          break;
        }

        case 2: {
          app.quit();
          break;
        }
      }
    });
}

function removeContentSecurityPolicy(
  betterSession: BetterSession = session.defaultSession as BetterSession,
) {
  // Allows defining multiple "onHeadersReceived" listeners
  // by enhancing the session.
  // Some plugins (e.g. adblocker) also define a "onHeadersReceived" listener
  enhanceWebRequest(betterSession);

  // Custom listener to tweak the content security policy
  betterSession.webRequest.onHeadersReceived((details, callback) => {
    details.responseHeaders ??= {};

    // prettier-ignore
    if (new URL(details.url).protocol === 'https:') {
      // Remove the content security policy
      delete details.responseHeaders['content-security-policy-report-only'];
      delete details.responseHeaders['Content-Security-Policy-Report-Only'];
      delete details.responseHeaders['content-security-policy'];
      delete details.responseHeaders['Content-Security-Policy'];

      if (
        !details.responseHeaders['access-control-allow-origin'] &&
        !details.responseHeaders['Access-Control-Allow-Origin']
      ) {
        details.responseHeaders['access-control-allow-origin'] = ['https://music.youtube.com'];
      }
    }

    callback({ cancel: false, responseHeaders: details.responseHeaders });
  });

  // When multiple listeners are defined, apply them all
  betterSession.webRequest.setResolver(
    'onHeadersReceived',
    async (listeners) => {
      return listeners.reduce(
        async (accumulator, listener) => {
          const acc = await accumulator;
          if (acc.cancel) {
            return acc;
          }

          const result = await listener.apply();
          return { ...accumulator, ...result };
        },
        Promise.resolve({ cancel: false }),
      );
    },
  );
}
