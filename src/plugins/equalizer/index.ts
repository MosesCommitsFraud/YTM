import { createPlugin } from '@/utils';
import { MenuContext } from '@/types/contexts';
import { MenuTemplate } from '@/menu';
import { defaultPresets, presetConfigs, Preset, FilterConfig } from './presets';

export type EqualizerPluginConfig = {
  enabled: boolean;
  filters: FilterConfig[];
  presets: { [preset in Preset]: boolean };
};

let appliedFilters: BiquadFilterNode[] = [];

export default createPlugin({
  name: () => 'Equalizer',
  description: () => 'Adjust the audio frequencies to your preference.',
  restartNeeded: false,
  addedVersion: '3.7.X',
  config: {
    enabled: false,
    filters: [],
    presets: { 'bass-booster': false },
  } as EqualizerPluginConfig,
  menu: async ({
    getConfig,
    setConfig,
  }: MenuContext<EqualizerPluginConfig>): Promise<MenuTemplate> => {
    const config = await getConfig();

    return [
      {
        label: 'Presets',
        type: 'submenu',
        submenu: defaultPresets.map((preset) => ({
          label: preset,
          type: 'radio',
          checked: config.presets[preset],
          click() {
            setConfig({
              presets: { ...config.presets, [preset]: !config.presets[preset] },
            });
          },
        })),
      },
    ];
  },
  renderer: {
    async start({ getConfig }) {
      const config = await getConfig();

      document.addEventListener(
        'ytmd:audio-can-play',
        ({ detail: { audioSource, audioContext } }) => {
          const filtersToApply = config.filters.concat(
            defaultPresets
              .filter((preset) => config.presets[preset])
              .map((preset) => presetConfigs[preset]),
          );
          filtersToApply.forEach((filter) => {
            const biquadFilter = audioContext.createBiquadFilter();
            biquadFilter.type = filter.type;
            biquadFilter.frequency.value = filter.frequency; // filter frequency in Hz
            biquadFilter.Q.value = filter.Q;
            biquadFilter.gain.value = filter.gain; // filter gain in dB

            audioSource.connect(biquadFilter);
            biquadFilter.connect(audioContext.destination);

            appliedFilters.push(biquadFilter);
          });
        },
        { once: true, passive: true },
      );
    },
    stop() {
      appliedFilters.forEach((filter) => filter.disconnect());
      appliedFilters = [];
    },
  },
});
