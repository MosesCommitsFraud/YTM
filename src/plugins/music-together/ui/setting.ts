import { Popup } from '@/plugins/music-together/element';
import { ElementFromHtml } from '@/plugins/utils/renderer';

import { createStatus } from './status';

import IconMusicCast from '../icons/music-cast.svg?raw';
import IconConnect from '../icons/connect.svg?raw';

export type SettingPopupProps = {
  onItemClick: (id: string) => void;
};
export const createSettingPopup = (props: SettingPopupProps) => {
  const status = createStatus();
  status.setStatus('disconnected');

  const result = Popup({
    data: [
      {
        type: 'custom',
        element: status.element,
      },
      {
        type: 'divider',
      },
      {
        id: 'music-together-host',
        type: 'item',
        icon: ElementFromHtml(IconMusicCast),
        text: 'Host',
        onClick: () => props.onItemClick('music-together-host'),
      },
      {
        type: 'item',
        icon: ElementFromHtml(IconConnect),
        text: 'Join',
        onClick: () => props.onItemClick('music-together-join'),
      },
    ],
    anchorAt: 'bottom-right',
    popupAt: 'top-right',
  });

  return {
    ...status,
    ...result,
  };
};
