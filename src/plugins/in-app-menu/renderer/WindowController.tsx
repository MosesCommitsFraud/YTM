import { css } from 'solid-styled-components';
import { Show } from 'solid-js';

import { IconButton } from './IconButton';
import { cacheNoArgs } from '@/providers/decorators';

const containerStyle = cacheNoArgs(
  () => css`
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 2px;
    -webkit-app-region: no-drag;
  `,
);

const buttonStyle = cacheNoArgs(() => css`
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease, transform 0.1s ease;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #f1f1f1;
  
  &:hover {
    background: rgba(255, 255, 255, 0.08);
    transform: scale(1.05);
  }
  
  &:active {
    transform: scale(0.95);
  }
  
  &.minimize-btn:hover {
    background: rgba(255, 193, 7, 0.15);
    color: #ffc107;
  }
  
  &.maximize-btn:hover {
    background: rgba(76, 175, 80, 0.15);
    color: #4caf50;
  }
  
  &.close-btn:hover {
    background: rgba(244, 67, 54, 0.15);
    color: #f44336;
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
      <button class={`${buttonStyle()} minimize-btn`} onClick={props.onMinimize} title="Minimize">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 8h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
      
      <button class={`${buttonStyle()} maximize-btn`} onClick={props.onToggleMaximize} title={props.isMaximize ? "Restore" : "Maximize"}>
        <Show 
          when={props.isMaximize}
          fallback={
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="3" width="10" height="10" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/>
            </svg>
          }
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="5" y="3" width="8" height="8" rx="1" stroke="currentColor" stroke-width="1.5" fill="none"/>
            <path d="M3 5v6a2 2 0 0 0 2 2h6" stroke="currentColor" stroke-width="1.5" fill="none"/>
          </svg>
        </Show>
      </button>
      
      <button class={`${buttonStyle()} close-btn`} onClick={props.onClose} title="Close">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  );
};
