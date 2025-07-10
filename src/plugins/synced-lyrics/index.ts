import style from './style.css?inline';
import { createPlugin } from '@/utils';

import { menu } from './menu';
import { renderer } from './renderer';
import { backend } from './backend';

import type { SyncedLyricsPluginConfig } from './types';

export default createPlugin({
  name: () => 'Synced Lyrics',
  description: () => 'Display synchronized lyrics for the current song.',
  authors: ['Non0reo', 'ArjixWasTaken', 'KimJammer', 'Strvm'],
  restartNeeded: true,
  addedVersion: '3.5.X',
  config: {
    enabled: false,
    preciseTiming: true,
    showLyricsEvenIfInexact: true,
    showTimeCodes: false,
    defaultTextString: '♪',
    lineEffect: 'fancy',
    romanization: true,
  } satisfies SyncedLyricsPluginConfig as SyncedLyricsPluginConfig,

  menu,
  renderer,
  backend,
  stylesheets: [style],
});
