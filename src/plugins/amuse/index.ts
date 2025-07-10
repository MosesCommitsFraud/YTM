import { createPlugin } from '@/utils';
import backend from './backend';

export interface MusicWidgetConfig {
  enabled: boolean;
}

export const defaultConfig: MusicWidgetConfig = {
  enabled: false,
};

export default createPlugin({
  name: () => 'Amuse',
  description: () => 'Show random fun facts and jokes.',
  addedVersion: '3.7.X',
  restartNeeded: true,
  config: defaultConfig,
  backend,
});
