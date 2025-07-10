import { createPlugin } from '@/utils';
import { onRendererLoad, onRendererUnload } from './renderer';

export type SkipSilencesPluginConfig = {
  enabled: boolean;
  onlySkipBeginning: boolean;
};

export default createPlugin({
  name: () => 'Skip Silences',
  description: () => 'Automatically skip silent parts of songs.',
  restartNeeded: true,
  config: {
    enabled: false,
    onlySkipBeginning: false,
  } as SkipSilencesPluginConfig,
  renderer: {
    start: onRendererLoad,
    stop: onRendererUnload,
  },
});
