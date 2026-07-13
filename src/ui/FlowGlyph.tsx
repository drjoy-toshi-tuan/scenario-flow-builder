import type { CSSProperties } from 'react';
import { Icon } from './icons';

// ─────────────────────────────────────────────────────────────────────────────
// Logo nhận diện flow dùng chung (đồng bộ mọi nơi): chữ M cho Main Flow (màu xanh
// lá), chữ S cho Sub Flow (màu cam sáng). Màu lấy từ token CSS --bk-flow-main /
// --bk-flow-sub nên tự hợp cả light/dark mode.
// ─────────────────────────────────────────────────────────────────────────────

export const FLOW_ICON_MAIN = 'tabler:square-rounded-letter-m-filled';
export const FLOW_ICON_SUB = 'tabler:square-rounded-letter-s-filled';

interface Props {
  isMain: boolean;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function FlowGlyph({ isMain, size = 16, className = '', style }: Props) {
  return (
    <Icon
      icon={isMain ? FLOW_ICON_MAIN : FLOW_ICON_SUB}
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      style={{ color: isMain ? 'var(--bk-flow-main)' : 'var(--bk-flow-sub)', ...style }}
    />
  );
}
