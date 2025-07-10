import { createPlugin } from '@/utils';
import { onMainLoad } from './main';
import { onMenu } from './menu';

export type ShortcutMappingType = {
  previous: string;
  playPause: string;
  next: string;
};
export type ShortcutsPluginConfig = {
  enabled: boolean;
  overrideMediaKeys: boolean;
  global: ShortcutMappingType;
  local: ShortcutMappingType;
};

export default createPlugin({
  name: () => 'Shortcuts',
  description: () => 'Configure and use keyboard shortcuts.',
  restartNeeded: true,
  config: {
    enabled: false,
    overrideMediaKeys: false,
    global: {
      previous: '',
      playPause: '',
      next: '',
    },
    local: {
      previous: '',
      playPause: '',
      next: '',
    },
  } as ShortcutsPluginConfig,
  menu: onMenu,

  backend: onMainLoad,
});
