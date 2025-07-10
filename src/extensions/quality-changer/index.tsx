import { dialog } from 'electron';

import { render } from 'solid-js/web';

import { createPlugin } from '@/utils';

import { QualitySettingButton } from './templates/quality-setting-button';

import type { YoutubePlayer } from '@/types/youtube-player';

export default createPlugin({
  name: () => 'Quality Changer',
  description: () => 'Change the quality of the audio in the YouTube Music player.',
  restartNeeded: false,
  config: {
    enabled: false,
  },

  backend({ ipc, window }) {
    ipc.handle(
      'ytmd:quality-changer',
      async (qualityLabels: string[], currentIndex: number) =>
        await dialog.showMessageBox(window, {
          type: 'question',
          buttons: qualityLabels,
          defaultId: currentIndex,
          title: 'Change Playback Quality',
          message: 'Select the desired playback quality.',
          detail: `Current quality: ${qualityLabels[currentIndex]}.`,
          cancelId: -1,
        }),
    );
  },

  renderer: {
    qualitySettingsButtonContainer: document.createElement('div'),
    onPlayerApiReady(api: YoutubePlayer, context) {
      const chooseQuality = async (e: MouseEvent) => {
        e.stopPropagation();

        const qualityLevels = api.getAvailableQualityLevels();

        const currentIndex = qualityLevels.indexOf(api.getPlaybackQuality());

        const quality = (await context.ipc.invoke(
          'ytmd:quality-changer',
          api.getAvailableQualityLabels(),
          currentIndex,
        )) as {
          response: number;
        };

        if (quality.response === -1) {
          return;
        }

        const newQuality = qualityLevels[quality.response];
        api.setPlaybackQualityRange(newQuality);
        api.setPlaybackQuality(newQuality);
      };

      render(
        () => (
          <QualitySettingButton
            label="Quality Settings"
            onClick={chooseQuality}
          />
        ),
        this.qualitySettingsButtonContainer,
      );

      const setup = () => {
        document
          .querySelector('.top-row-buttons.ytmusic-player')
          ?.prepend(this.qualitySettingsButtonContainer);
      };

      setup();
    },
    stop() {
      document
        .querySelector('.top-row-buttons.ytmusic-player')
        ?.removeChild(this.qualitySettingsButtonContainer);
    },
  },
});
