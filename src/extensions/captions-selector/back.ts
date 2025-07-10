import prompt from 'custom-electron-prompt';

import promptOptions from '@/providers/prompt-options';
import { createBackend } from '@/utils';

export default createBackend({
  start({ ipc: { handle }, window }) {
    handle(
      'ytmd:captions-selector',
      async (captionLabels: Record<string, string>, currentIndex: string) =>
        await prompt(
          {
            title: 'Select a caption',
            label: 'Select a caption',
            type: 'select',
            value: currentIndex,
            selectOptions: captionLabels,
            resizable: true,
            ...promptOptions(),
          },
          window,
        ),
    );
  },
  stop({ ipc: { removeHandler } }) {
    removeHandler('captionsSelector');
  },
});
