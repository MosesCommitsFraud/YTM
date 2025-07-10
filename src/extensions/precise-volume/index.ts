import { globalShortcut, MenuItem } from 'electron';
import prompt, { KeybindOptions } from 'custom-electron-prompt';

import hudStyle from './volume-hud.css?inline';
import { createPlugin } from '@/utils';

import promptOptions from '@/providers/prompt-options';
import { overrideListener } from './override';
import { onConfigChange, onPlayerApiReady } from './renderer';

export type PreciseVolumePluginConfig = {
  enabled: boolean;
  /**
   * Percentage of volume to change
   */
  steps: number;
  /**
   * Enable ArrowUp + ArrowDown local shortcuts
   */
  arrowsShortcut: boolean;
  globalShortcuts: {
    volumeUp: string;
    volumeDown: string;
  };
  /**
   * Plugin save volume between session here
   */
  savedVolume: number | undefined;
};

export default createPlugin({
  name: () => 'Precise Volume',
  description: () => 'Fine-grained volume control',
  restartNeeded: true,
  config: {
    enabled: false,
    steps: 1,
    arrowsShortcut: true,
    globalShortcuts: {
      volumeUp: '',
      volumeDown: '',
    },
    savedVolume: undefined,
  } as PreciseVolumePluginConfig,
  stylesheets: [hudStyle],
  menu: async ({ setConfig, getConfig, window }) => {
    const config = await getConfig();

    function changeOptions(
      changedOptions: Partial<PreciseVolumePluginConfig>,
      options: PreciseVolumePluginConfig,
    ) {
      for (const option in changedOptions) {
        // HACK: Weird TypeScript error
        (options as Record<string, unknown>)[option] = (
          changedOptions as Record<string, unknown>
        )[option];
      }

      setConfig(options);
    }

    // Helper function for globalShortcuts prompt
    const kb = (
      label_: string,
      value_: string,
      default_: string,
    ): KeybindOptions => ({
      value: value_,
      label: label_,
      default: default_ || undefined,
    });

    async function promptVolumeSteps(options: PreciseVolumePluginConfig) {
      const output = await prompt(
        {
          title: 'Volume Steps',
          label: 'Volume Steps',
          value: options.steps || 1,
          type: 'counter',
          counterOptions: { minimum: 0, maximum: 100, multiFire: true },
          width: 380,
          ...promptOptions(),
        },
        window,
      );

      if (output || output === 0) {
        // 0 is somewhat valid
        changeOptions({ steps: output }, options);
      }
    }

    async function promptGlobalShortcuts(
      options: PreciseVolumePluginConfig,
      item: MenuItem,
    ) {
      const output = await prompt(
        {
          title: 'Global Shortcuts',
          label: 'Global Shortcuts',
          type: 'keybind',
          keybindOptions: [
            kb(
              'Increase Volume',
              'volumeUp',
              options.globalShortcuts?.volumeUp,
            ),
            kb(
              'Decrease Volume',
              'volumeDown',
              options.globalShortcuts?.volumeDown,
            ),
          ],
          ...promptOptions(),
        },
        window,
      );

      if (output) {
        const newGlobalShortcuts: {
          volumeUp: string;
          volumeDown: string;
        } = { volumeUp: '', volumeDown: '' };
        for (const { value, accelerator } of output) {
          newGlobalShortcuts[value as keyof typeof newGlobalShortcuts] =
            accelerator;
        }

        changeOptions({ globalShortcuts: newGlobalShortcuts }, options);

        item.checked =
          Boolean(options.globalShortcuts.volumeUp) ||
          Boolean(options.globalShortcuts.volumeDown);
      } else {
        // Reset checkbox if prompt was canceled
        item.checked = !item.checked;
      }
    }

    return [
      {
        label: 'Arrows Shortcuts',
        type: 'checkbox',
        checked: Boolean(config.arrowsShortcut),
        click(item) {
          changeOptions({ arrowsShortcut: item.checked }, config);
        },
      },
      {
        label: 'Global Shortcuts',
        type: 'checkbox',
        checked: Boolean(
          config.globalShortcuts?.volumeUp ??
            config.globalShortcuts?.volumeDown,
        ),
        click: (item) => promptGlobalShortcuts(config, item),
      },
      {
        label: 'Custom Volume Steps',
        click: () => promptVolumeSteps(config),
      },
    ];
  },

  async backend({ getConfig, ipc }) {
    const config = await getConfig();

    if (config.globalShortcuts?.volumeUp) {
      globalShortcut.register(config.globalShortcuts.volumeUp, () =>
        ipc.send('changeVolume', true),
      );
    }

    if (config.globalShortcuts?.volumeDown) {
      globalShortcut.register(config.globalShortcuts.volumeDown, () =>
        ipc.send('changeVolume', false),
      );
    }
  },

  renderer: {
    start() {
      overrideListener();
    },
    onPlayerApiReady,
    onConfigChange,
  },
});
