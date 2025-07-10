import { createPlugin } from '@/utils';

import backend from './back';
import renderer, { CaptionsSelectorConfig, LanguageOptions } from './renderer';

import type { YoutubePlayer } from '@/types/youtube-player';

export default createPlugin<
  unknown,
  unknown,
  {
    captionsSettingsButton?: HTMLElement;
    captionTrackList: LanguageOptions[] | null;
    api: YoutubePlayer | null;
    config: CaptionsSelectorConfig | null;
    videoChangeListener: () => void;
  },
  CaptionsSelectorConfig
>({
  name: () => 'Plugins.Captions-selector.name',
  description: () => 'Plugins.Captions-selector.description',
  config: {
    enabled: false,
    disableCaptions: false,
    autoload: false,
    lastCaptionsCode: '',
  },

  async menu({ getConfig, setConfig }) {
    const config = await getConfig();
    return [
      {
        label: 'Plugins.Captions-selector.menu.autoload',
        type: 'checkbox',
        checked: config.autoload,
        click(item) {
          setConfig({ autoload: item.checked });
        },
      },
      {
        label: 'Plugins.Captions-selector.menu.disable-captions',
        type: 'checkbox',
        checked: config.disableCaptions,
        click(item) {
          setConfig({ disableCaptions: item.checked });
        },
      },
    ];
  },

  backend,
  renderer,
});
