import { Menu, nativeImage, screen, Tray } from 'electron';
import is from 'electron-is';

import defaultTrayIconAsset from '@assets/youtube-music-tray.png?asset&asarUnpack';
import pausedTrayIconAsset from '@assets/youtube-music-tray-paused.png?asset&asarUnpack';

import config from './config';

import { restart } from './providers/app-controls';
import registerCallback, { SongInfoEvent } from './providers/song-info';
import getSongControls from './providers/song-controls';

import type { MenuTemplate } from './menu';

// Prevent tray being garbage collected
let tray: Electron.Tray | undefined;

type TrayEvent = (
  event: Electron.KeyboardEvent,
  bounds: Electron.Rectangle,
) => void;

export const setTrayOnClick = (fn: TrayEvent) => {
  if (!tray) {
    return;
  }

  tray.removeAllListeners('click');
  tray.on('click', fn);
};

// Won't do anything on macOS since its disabled
export const setTrayOnDoubleClick = (fn: TrayEvent) => {
  if (!tray) {
    return;
  }

  tray.removeAllListeners('double-click');
  tray.on('double-click', fn);
};

export const setUpTray = (app: Electron.App, win: Electron.BrowserWindow) => {
  if (!config.get('options.tray')) {
    tray = undefined;
    return;
  }

  const { playPause, next, previous } = getSongControls(win);

  const pixelRatio = is.windows()
    ? screen.getPrimaryDisplay().scaleFactor || 1
    : 1;
  const defaultTrayIcon = nativeImage
    .createFromPath(defaultTrayIconAsset)
    .resize({
      width: 16 * pixelRatio,
      height: 16 * pixelRatio,
    });
  const pausedTrayIcon = nativeImage
    .createFromPath(pausedTrayIconAsset)
    .resize({
      width: 16 * pixelRatio,
      height: 16 * pixelRatio,
    });

  tray = new Tray(defaultTrayIcon);

  tray.setToolTip('Play/Pause');

  // MacOS only
  tray.setIgnoreDoubleClickEvents(true);

  tray.on('click', () => {
    if (config.get('options.trayClickPlayPause')) {
      playPause();
    } else if (win.isVisible()) {
      win.hide();
      app.dock?.hide();
    } else {
      win.show();
      app.dock?.show();
    }
  });

  const template: MenuTemplate = [
    {
      label: 'Play/Pause',
      click() {
        playPause();
      },
    },
    {
      label: 'Next',
      click() {
        next();
      },
    },
    {
      label: 'Previous',
      click() {
        previous();
      },
    },
    {
      label: 'Show',
      click() {
        win.show();
        app.dock?.show();
      },
    },
    { type: 'separator' },
    {
      label: 'Restart',
      click: restart,
    },
    { type: 'separator' },
    {
      label: 'Quit',
      role: 'quit',
    },
  ];

  const trayMenu = Menu.buildFromTemplate(template);
  tray.setContextMenu(trayMenu);

  registerCallback((songInfo, event) => {
    if (event === SongInfoEvent.TimeChanged) return;

    if (tray) {
      if (typeof songInfo.isPaused === 'undefined') {
        tray.setImage(defaultTrayIcon);
        return;
      }

      tray.setToolTip(
        `Artist: ${songInfo.artist}, Title: ${songInfo.title}`,
      );

      tray.setImage(songInfo.isPaused ? pausedTrayIcon : defaultTrayIcon);
    }
  });
};
