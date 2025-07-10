import { createPlugin } from '@/utils';
import { onPlayerApiReady, onUnload } from './renderer';

export default createPlugin({
  name: () => 'Playback Speed',
  description: () => 'Adjust the playback speed of the video.',
  restartNeeded: false,
  config: {
    enabled: false,
  },
  renderer: {
    stop: onUnload,
    onPlayerApiReady,
  },
});
