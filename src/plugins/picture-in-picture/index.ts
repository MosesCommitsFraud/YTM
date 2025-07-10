import style from './style.css?inline';
import { createPlugin } from '@/utils';

import { onConfigChange, onMainLoad } from './main';
import { onMenu } from './menu';
import { onPlayerApiReady } from './renderer';

export type PictureInPicturePluginConfig = {
  enabled: boolean;
  alwaysOnTop: boolean;
  savePosition: boolean;
  saveSize: boolean;
  hotkey: 'P';
  'pip-position': [number, number];
  'pip-size': [number, number];
  isInPiP: boolean;
  useNativePiP: boolean;
};

export default createPlugin({
  name: () => 'Picture-in-Picture',
  description: () => 'Enable picture-in-picture mode for videos.',
  restartNeeded: true,
  config: {
    'enabled': false,
    'alwaysOnTop': true,
    'savePosition': true,
    'saveSize': false,
    'hotkey': 'P',
    'pip-position': [10, 10],
    'pip-size': [450, 275],
    'isInPiP': false,
    'useNativePiP': true,
  } as PictureInPicturePluginConfig,
  stylesheets: [style],
  menu: onMenu,

  backend: {
    start: onMainLoad,
    onConfigChange,
  },
  renderer: {
    onPlayerApiReady,
  },
});
