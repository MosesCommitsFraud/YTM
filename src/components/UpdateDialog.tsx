import { createSignal, Show, JSX } from 'solid-js';
import { css } from 'solid-styled-components';
import { Portal } from 'solid-js/web';
import { Transition } from 'solid-transition-group';

import { cacheNoArgs } from '@/providers/decorators';

// Dialog overlay styles matching in-app menu design
const overlayStyle = cacheNoArgs(
  () => css`
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 100000;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    box-sizing: border-box;
  `,
);

const dialogStyle = cacheNoArgs(
  () => css`
    background: color-mix(
      in srgb,
      var(--titlebar-background-color, #030303) 80%,
      rgba(0, 0, 0, 0.2)
    );
    backdrop-filter: blur(8px);
    border-radius: 12px;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.1),
      0 8px 32px rgba(0, 0, 0, 0.4),
      0 4px 16px rgba(0, 0, 0, 0.3);
    
    min-width: 400px;
    max-width: 500px;
    padding: 24px;
    color: #f1f1f1;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    
    transform-origin: center center;
    
    h2 {
      margin: 0 0 12px 0;
      font-size: 18px;
      font-weight: 600;
      color: #ffffff;
    }
    
    p {
      margin: 0 0 16px 0;
      font-size: 14px;
      line-height: 1.4;
      color: #cccccc;
    }
    
    .dialog-detail {
      font-size: 12px;
      color: #999999;
      margin-bottom: 24px;
    }
  `,
);

const buttonGroupStyle = cacheNoArgs(
  () => css`
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    margin-top: 24px;
  `,
);

const buttonStyle = cacheNoArgs(
  () => css`
    padding: 8px 16px;
    border-radius: 6px;
    border: none;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.2, 0, 0.6, 1);
    min-width: 80px;
    
    &.primary {
      background: #ff2d55;
      color: white;
      
      &:hover {
        background: #e02548;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(255, 45, 85, 0.3);
      }
      
      &:active {
        transform: translateY(0);
        box-shadow: 0 2px 6px rgba(255, 45, 85, 0.3);
      }
    }
    
    &.secondary {
      background: rgba(255, 255, 255, 0.1);
      color: #f1f1f1;
      border: 1px solid rgba(255, 255, 255, 0.2);
      
      &:hover {
        background: rgba(255, 255, 255, 0.15);
        border-color: rgba(255, 255, 255, 0.3);
        transform: translateY(-1px);
      }
      
      &:active {
        transform: translateY(0);
      }
    }
    
    &.tertiary {
      background: transparent;
      color: #999999;
      
      &:hover {
        color: #cccccc;
        background: rgba(255, 255, 255, 0.05);
      }
    }
  `,
);

const progressBarStyle = cacheNoArgs(
  () => css`
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 3px;
    overflow: hidden;
    margin: 16px 0;
    
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #ff2d55, #ff6b8a);
      border-radius: 3px;
      transition: width 0.3s ease;
    }
  `,
);

const animationStyle = cacheNoArgs(() => ({
  enter: css`
    opacity: 0;
    transform: scale(0.9) translateY(20px);
  `,
  enterActive: css`
    transition:
      opacity 0.3s cubic-bezier(0.33, 1, 0.68, 1),
      transform 0.3s cubic-bezier(0.33, 1, 0.68, 1);
  `,
  exitTo: css`
    opacity: 0;
    transform: scale(0.9) translateY(20px);
  `,
  exitActive: css`
    transition:
      opacity 0.2s cubic-bezier(0.32, 0, 0.67, 0),
      transform 0.2s cubic-bezier(0.32, 0, 0.67, 0);
  `,
}));

export interface UpdateDialogProps {
  open: boolean;
  type: 'update-available' | 'download-progress' | 'update-ready' | 'error' | 'checking' | 'no-update';
  title: string;
  message: string;
  detail?: string;
  version?: string;
  progress?: {
    percent: number;
    bytesPerSecond: number;
    transferred: number;
    total: number;
  };
  onClose: () => void;
  onPrimary?: () => void;
  onSecondary?: () => void;
  onTertiary?: () => void;
  primaryText?: string;
  secondaryText?: string;
  tertiaryText?: string;
}

export const UpdateDialog = (props: UpdateDialogProps) => {
  const formatBytes = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return mb.toFixed(1) + ' MB';
  };

  const formatSpeed = (bytesPerSecond: number) => {
    const mbps = bytesPerSecond / (1024 * 1024);
    return mbps.toFixed(1) + ' MB/s';
  };

  const getButtons = () => {
    switch (props.type) {
      case 'update-available':
        return {
          primary: props.primaryText || 'Download Now',
          secondary: props.secondaryText || 'Download Later',
          tertiary: props.tertiaryText || 'Disable Auto-Updates'
        };
      case 'update-ready':
        return {
          primary: props.primaryText || 'Restart Now',
          secondary: props.secondaryText || 'Restart Later',
        };
      case 'error':
      case 'no-update':
      case 'checking':
        return {
          primary: props.primaryText || 'OK',
        };
      case 'download-progress':
        return {
          secondary: props.secondaryText || 'Cancel',
        };
      default:
        return { primary: 'OK' };
    }
  };

  const buttons = getButtons();

  return (
    <Portal>
      <Transition
        appear
        enterClass={animationStyle().enter}
        enterActiveClass={animationStyle().enterActive}
        exitToClass={animationStyle().exitTo}
        exitActiveClass={animationStyle().exitActive}
      >
        <Show when={props.open}>
          <div class={overlayStyle()} onClick={props.onClose}>
            <div class={dialogStyle()} onClick={(e) => e.stopPropagation()}>
              <h2>{props.title}</h2>
              <p>{props.message}</p>
              
              <Show when={props.detail}>
                <div class="dialog-detail">{props.detail}</div>
              </Show>

              <Show when={props.type === 'download-progress' && props.progress}>
                <div class={progressBarStyle()}>
                  <div 
                    class="progress-fill" 
                    style={{ width: `${props.progress?.percent || 0}%` }}
                  />
                </div>
                <div class="dialog-detail">
                  {props.progress && (
                    <>
                      Progress: {props.progress.percent.toFixed(1)}% 
                      ({formatBytes(props.progress.transferred)} / {formatBytes(props.progress.total)})
                      <br />
                      Speed: {formatSpeed(props.progress.bytesPerSecond)}
                    </>
                  )}
                </div>
              </Show>

              <div class={buttonGroupStyle()}>
                <Show when={buttons.tertiary}>
                  <button 
                    class={`${buttonStyle()} tertiary`}
                    onClick={props.onTertiary}
                  >
                    {buttons.tertiary}
                  </button>
                </Show>
                
                <Show when={buttons.secondary}>
                  <button 
                    class={`${buttonStyle()} secondary`}
                    onClick={props.onSecondary}
                  >
                    {buttons.secondary}
                  </button>
                </Show>
                
                <Show when={buttons.primary}>
                  <button 
                    class={`${buttonStyle()} primary`}
                    onClick={props.onPrimary}
                  >
                    {buttons.primary}
                  </button>
                </Show>
              </div>
            </div>
          </div>
        </Show>
      </Transition>
    </Portal>
  );
};
