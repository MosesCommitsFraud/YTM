import { ElementFromHtml } from '@/plugins/utils/renderer';

import { Popup } from '../element';
import { createStatus } from '../ui/status';

import IconKey from '../icons/key.svg?raw';
import IconOff from '../icons/off.svg?raw';
import IconTune from '../icons/tune.svg?raw';

export type HostPopupProps = {
  onItemClick: (id: string) => void;
};
export const createHostPopup = (props: HostPopupProps) => {
  const status = createStatus();
  status.setStatus('host');

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
        id: 'music-together-copy-id',
        type: 'item',
        icon: ElementFromHtml(IconKey),
        text: 'Click to copy ID',
        onClick: () => props.onItemClick('music-together-copy-id'),
      },
      {
        id: 'music-together-permission',
        type: 'item',
        icon: ElementFromHtml(IconTune),
        text: 'Set permission (Host Only)',
        onClick: () => props.onItemClick('music-together-permission'),
      },
      {
        type: 'divider',
      },
      {
        type: 'item',
        id: 'music-together-close',
        icon: ElementFromHtml(IconOff),
        text: 'Close',
        onClick: () => props.onItemClick('music-together-close'),
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
