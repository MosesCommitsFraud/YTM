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
  name: () => 'Captions Selector',
  description: () => 'Select and manage video captions/subtitles.',
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
        label: 'Autoload',
        type: 'checkbox',
        checked: config.autoload,
        click(item) {
          setConfig({ autoload: item.checked });
        },
      },
      {
        label: 'Disable captions',
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
