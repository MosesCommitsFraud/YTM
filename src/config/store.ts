import Store from 'electron-store';

import defaults from './defaults';

import { DefaultPresetList, type Preset } from '@/plugins/downloader/types';

// prettier-ignore
export type IStore = InstanceType<typeof import('conf').default<Record<string, unknown>>>;

// Remove the 'migrations' variable and its reference in the Store config

export default new Store({
  defaults: {
    ...defaults,
    // README: 'plugin' uses deepmerge to populate the default values, so it is not necessary to include it here
  },
  clearInvalidConfig: false,
});
