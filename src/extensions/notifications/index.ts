import { createPlugin } from '@/utils';

import { onConfigChange, onMainLoad } from './main';
import { onMenu } from './menu';

export interface NotificationsPluginConfig {
  enabled: boolean;
  unpauseNotification: boolean;
  /**
   * Has effect only on Linux
   */
  urgency: 'low' | 'normal' | 'critical';
  /**
   * the following has effect only on Windows
   */
  interactive: boolean;
  /**
   * See extensions/notifications/utils for more info
   */
  toastStyle: number;
  refreshOnPlayPause: boolean;
  trayControls: boolean;
  hideButtonText: boolean;
}

export const defaultConfig: NotificationsPluginConfig = {
  enabled: false,
  unpauseNotification: false,
  urgency: 'normal',
  interactive: true,
  toastStyle: 1,
  refreshOnPlayPause: false,
  trayControls: true,
  hideButtonText: false,
};

export default createPlugin({
  name: () => 'Notifications',
  description: () => 'Show notifications for various events',
  restartNeeded: true,
  config: defaultConfig,
  menu: onMenu,
  backend: {
    start: onMainLoad,
    onConfigChange,
  },
});
