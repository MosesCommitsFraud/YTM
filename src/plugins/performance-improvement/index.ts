import { createPlugin } from '@/utils';

import { injectRm3 } from './scripts/rm3';
import { injectCpuTamer } from './scripts/cpu-tamer';

export default createPlugin({
  name: () => 'Performance Improvement',
  description: () => 'Enhances system performance and stability.',
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
