import { createPlugin } from '@/utils';

import type { VideoDataChanged } from '@/types/video-data-changed';
import type { YoutubePlayer } from '@/types/youtube-player';

export type DisableAutoPlayPluginConfig = {
  enabled: boolean;
  applyOnce: boolean;
};

export default createPlugin<
  unknown,
  unknown,
  {
    config: DisableAutoPlayPluginConfig | null;
    api: YoutubePlayer | null;
    eventListener: (event: CustomEvent<VideoDataChanged>) => void;
    timeUpdateListener: (e: Event) => void;
    lastUserGestureAt: number;
    userGestureListener: () => void;
  },
  DisableAutoPlayPluginConfig
>({
  name: () => 'Disable Autoplay',
  description: () => 'Prevent YouTube Music from automatically playing the next song.',
  restartNeeded: false,
  config: {
    enabled: false,
    applyOnce: false,
  },
  menu: async ({ getConfig, setConfig }) => {
    const config = await getConfig();

    return [
      {
        label: t('plugins.disable-autoplay.menu.apply-once'),
        type: 'checkbox',
        checked: config.applyOnce,
        async click() {
          const nowConfig = await getConfig();
          setConfig({
            applyOnce: !nowConfig.applyOnce,
          });
        },
      },
    ];
  },
  renderer: {
    config: null,
    api: null,
    lastUserGestureAt: 0,
    userGestureListener() {
      this.lastUserGestureAt = Date.now();
    },
    eventListener(event: CustomEvent<VideoDataChanged>) {
      if (this.config?.applyOnce) {
        document.removeEventListener('videodatachange', this.eventListener);
      }

      if (event.detail.name === 'dataloaded') {
        const now = Date.now();
        const recentGesture = now - (this.lastUserGestureAt ?? 0) < 3000;

        // If the track load was immediately preceded by a user gesture,
        // don't block playback (fixes first click not starting playback).
        if (recentGesture) {
          return;
        }

        this.api?.pauseVideo();
        document
          .querySelector<HTMLVideoElement>('video')
          ?.addEventListener('timeupdate', this.timeUpdateListener, {
            once: true,
          });
      }
    },
    timeUpdateListener(e: Event) {
      if (e.target instanceof HTMLVideoElement) {
        e.target.pause();
      }
    },
    async start({ getConfig }) {
      this.config = await getConfig();
      // Track recent user gestures to differentiate autoplay from manual play
      document.addEventListener('pointerdown', this.userGestureListener, {
        passive: true,
      });
      document.addEventListener('keydown', this.userGestureListener, {
        passive: true,
      });
      document.addEventListener('touchstart', this.userGestureListener, {
        passive: true,
      });
      document.addEventListener('mousedown', this.userGestureListener, {
        passive: true,
      });
    },
    onPlayerApiReady(api) {
      this.api = api;

      document.addEventListener('videodatachange', this.eventListener);
    },
    stop() {
      document.removeEventListener('videodatachange', this.eventListener);
      document.removeEventListener('pointerdown', this.userGestureListener);
      document.removeEventListener('keydown', this.userGestureListener);
      document.removeEventListener('touchstart', this.userGestureListener);
      document.removeEventListener('mousedown', this.userGestureListener);
    },
    onConfigChange(newConfig) {
      this.config = newConfig;
    },
  },
});
