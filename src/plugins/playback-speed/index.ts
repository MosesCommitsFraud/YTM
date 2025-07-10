import { createPlugin } from '@/utils';
import { onPlayerApiReady, onUnload } from './renderer';

export default createPlugin({
  name: () => 'Playback Speed',
  description: () => 'Change the playback speed of your music.',
  restartNeeded: false,
  config: {
    enabled: false,
  },
  renderer: {
    stop: onUnload,
    onPlayerApiReady,
  },
});
