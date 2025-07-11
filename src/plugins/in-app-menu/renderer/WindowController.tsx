import { css } from 'solid-styled-components';
import { Show } from 'solid-js';

import { IconButton } from './IconButton';
import { cacheNoArgs } from '@/providers/decorators';

const containerStyle = cacheNoArgs(
  () => css`
    display: flex;
    justify-content: flex-end;
    align-items: center;
    z-index: 10000001;
    background: #fff;
    border: 2px solid #f45c5c;
    box-shadow: 0 2px 12px #0003;
    padding: 0 4px;
    border-radius: 10px;
    position: relative;
    min-width: 120px;
    min-height: 36px;
    overflow: visible;
  `,
);

const buttonStyle = cacheNoArgs(() => css`
  width: 32px;
  height: 32px;
  border-radius: 8px;
  margin: 0 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: box-shadow 0.18s, background 0.18s;
  border: 1.5px solid #232323;
  background: #181818;
  box-shadow: 0 1px 4px #0002;
  padding: 0;
  cursor: pointer;
  &:hover {
    background: #232323;
    box-shadow: 0 2px 8px #0003;
  }
`);

export type WindowControllerProps = {
  isMaximize?: boolean;

  onToggleMaximize?: () => void;
  onMinimize?: () => void;
  onClose?: () => void;
};
export const WindowController = (props: WindowControllerProps) => {
  return (
    <div class={containerStyle()}>
      <button class={buttonStyle()} onClick={props.onMinimize} title="Minimize">
        <svg width={16} height={16} viewBox="0 0 16 16">
          <rect x="3" y="7.5" width="10" height="1.5" rx="0.75" fill="#f4c542" />
        </svg>
      </button>
      <button class={buttonStyle()} onClick={props.onToggleMaximize} title="Maximize/Restore">
        <svg width={16} height={16} viewBox="0 0 16 16">
          <rect x="3" y="3" width="10" height="10" rx="2" fill="#5fc86b" />
        </svg>
      </button>
      <button class={buttonStyle()} onClick={props.onClose} title="Close">
        <svg width={16} height={16} viewBox="0 0 16 16">
          <line x1="4" y1="4" x2="12" y2="12" stroke="#f45c5c" stroke-width="2" stroke-linecap="round"/>
          <line x1="12" y1="4" x2="4" y2="12" stroke="#f45c5c" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  );
};
