import { inject } from 'simple-youtube-age-restriction-bypass';

import { createPlugin } from '@/utils';

export default createPlugin({
  name: () => 'Bypass Age Restrictions',
  description: () => 'Bypass YouTube age restrictions for music videos.',
  restartNeeded: true,

  // See https://github.com/organization/Simple-YouTube-Age-Restriction-Bypass#userscript
  renderer: () => inject(),
});
