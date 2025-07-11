import { JSX, splitProps } from 'solid-js';
import { css } from 'solid-styled-components';

import { cacheNoArgs } from '@/providers/decorators';

const menuStyle = cacheNoArgs(
  () => css`
    -webkit-app-region: none;

    display: flex;
    justify-content: center;
    align-items: center;
    align-self: stretch;

    height: 32px;
    line-height: 32px;
    min-width: 40px;
    padding: 0 8px;
    border-radius: 8px;
    font-size: 1.15em;
    font-weight: 600;
    letter-spacing: 0.01em;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);

    &:hover {
      background-color: rgba(255, 255, 255, 0.13);
    }
    &:active {
      scale: 0.95;
    }

    &[data-selected='true'] {
      background-color: rgba(255, 255, 255, 0.22);
    }
  `,
);

export type MenuButtonProps = JSX.HTMLAttributes<HTMLLIElement> & {
  text?: string;
  selected?: boolean;
};
export const MenuButton = (props: MenuButtonProps) => {
  const [local, leftProps] = splitProps(props, ['text']);

  return (
    <li {...leftProps} class={menuStyle()} data-selected={props.selected}>
      {local.text}
    </li>
  );
};
