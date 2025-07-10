import { createPlugin } from '@/utils';

import { injectRm3 } from './scripts/rm3';
import { injectCpuTamer } from './scripts/cpu-tamer';

export default createPlugin({
  name: () => 'plugins.performance-improvement.name',
  description: () => 'plugins.performance-improvement.description',
  restartNeeded: true,
  addedVersion: '3.9.X',
  config: {
    enabled: true,
  },
  renderer() {
    injectRm3();
    injectCpuTamer();
  },
});
