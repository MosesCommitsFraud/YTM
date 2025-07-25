import { getSongInfo } from '@/providers/song-info-front';

import { lyricsStore, retrySearch } from '../../providers';

interface ErrorDisplayProps {
  error: Error;
}

// prettier-ignore
export const ErrorDisplay = (props: ErrorDisplayProps) => {
  return (
    <div style={{ 'margin-bottom': '5%' }}>
      <pre
        style={{
          'background-color': 'var(--ytmusic-color-black1)',
          'border-radius': '8px',
          'color': '#58f000',
          'max-width': '100%',
          'margin-top': '1em',
          'margin-bottom': '0',
          'padding': '0.5em',
          'font-family': 'serif',
          'font-size': 'large',
        }}
      >
        Error fetching lyrics.
      </pre>
      <pre
        style={{
          'background-color': 'var(--ytmusic-color-black1)',
          'border-radius': '8px',
          'color': '#f0a500',
          'white-space': 'pre',
          'overflow-x': 'auto',
          'max-width': '100%',
          'margin-top': '0.5em',
          'padding': '0.5em',
          'font-family': 'monospace',
          'font-size': 'large',
        }}
      >
        {props.error.stack}
      </pre>

      <yt-button-renderer
        onClick={() => retrySearch(lyricsStore.provider, getSongInfo())}
        data={{
          icon: { iconType: 'REFRESH' },
          isDisabled: false,
          style: 'STYLE_DEFAULT',
          text: {
            simpleText: 'Retry fetching lyrics'
          },
        }}
        style={{
          'margin-top': '1em',
          'width': '100%'
        }}
      />
    </div>
  );
};
