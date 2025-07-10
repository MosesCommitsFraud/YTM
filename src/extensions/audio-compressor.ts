import { createPlugin } from '@/utils';

export default createPlugin({
  name: () => 'Audio Compressor',
  description: () => 'Compresses audio to reduce dynamic range.',

  renderer() {
    document.addEventListener(
      'ytmd:audio-can-play',
      ({ detail: { audioSource, audioContext } }) => {
        const compressor = audioContext.createDynamicsCompressor();

        compressor.threshold.value = -50;
        compressor.ratio.value = 12;
        compressor.knee.value = 40;
        compressor.attack.value = 0;
        compressor.release.value = 0.25;

        audioSource.connect(compressor);
        compressor.connect(audioContext.destination);
      },
      { once: true, passive: true },
    );
  },
});
