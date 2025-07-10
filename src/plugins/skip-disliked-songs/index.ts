import { createPlugin } from '@/utils';
import { waitForElement } from '@/utils/wait-for-element';

export default createPlugin<
  unknown,
  unknown,
  {
    observer?: MutationObserver;
    start(): void;
    stop(): void;
  }
>({
  name: () => 'Skip Disliked Songs',
  description: () => 'Automatically skip songs you have disliked.',
  restartNeeded: false,
  renderer: {
    start() {
      waitForElement<HTMLElement>('#like-button-renderer').then(
        (dislikeBtn) => {
          this.observer = new MutationObserver(() => {
            if (dislikeBtn?.getAttribute('like-status') == 'DISLIKE') {
              document
                .querySelector<HTMLButtonElement>(
                  'tp-yt-paper-icon-button.next-button',
                )
                ?.click();
            }
          });
          this.observer.observe(dislikeBtn, {
            attributes: true,
            childList: false,
            subtree: false,
          });
        },
      );
    },
    stop() {
      this.observer?.disconnect();
    },
  },
});
