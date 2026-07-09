import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

// ─────────────────────────────────────────────────────────────────────────────
// Tooltip nổi hiện full text KHI VÀ CHỈ KHI nội dung BỊ TRÀN (dài hơn ô, bị cắt "…").
// Không tràn -> KHÔNG hiện gì (không dùng thuộc tính title gốc -> tránh "2 tầng hover":
// tooltip trình duyệt luôn hiện + tooltip này). Tooltip render qua portal ra <body>
// nên không bị cắt bởi overflow của khung cha (panel setting, preview trên canvas…).
//
// - HoverTip: bọc 1 <span> văn bản tự cắt "…".
// - useClipTip: hook dùng chung cho phần tử khác (vd <input> read-only cuộn ngang).
// ─────────────────────────────────────────────────────────────────────────────

interface TipPos {
  x: number;
  y: number;
  below: boolean;
}

// Hook: gắn onMouseEnter/onMouseLeave vào phần tử ref; trả thêm `tip` (portal) để
// render. Chỉ hiện tooltip khi phần tử thực sự bị cắt (tràn ngang hoặc dọc).
export function useClipTip(ref: RefObject<HTMLElement | null>, content: string) {
  const [pos, setPos] = useState<TipPos | null>(null);

  const onMouseEnter = () => {
    const el = ref.current;
    if (!el || !content) return;
    const clipped = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
    if (!clipped) return;
    const r = el.getBoundingClientRect();
    const below = r.top < 90; // gần mép trên -> lật xuống dưới cho khỏi tràn màn hình
    const cx = Math.min(Math.max(r.left + r.width / 2, 200), window.innerWidth - 200);
    setPos({ x: cx, y: below ? r.bottom : r.top, below });
  };
  const onMouseLeave = () => setPos(null);

  // Ẩn tooltip nếu cuộn/zoom (vị trí đã cũ) — an toàn cho trạng thái thoáng qua.
  useLayoutEffect(() => {
    if (!pos) return;
    const onScroll = () => setPos(null);
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [pos]);

  const tip =
    pos &&
    createPortal(
      <span
        className="bk-hovertip"
        style={{
          left: pos.x,
          top: pos.y,
          transform: pos.below ? 'translate(-50%, 8px)' : 'translate(-50%, calc(-100% - 8px))',
        }}
      >
        {content}
      </span>,
      document.body,
    );

  return { onMouseEnter, onMouseLeave, tip };
}

interface HoverTipProps {
  content: string; // full text hiển thị trong tooltip
  children: ReactNode; // nội dung hiển thị trong ô (có thể bị cắt "…")
  className?: string; // class cho ô văn bản (mang CSS cắt "…")
  style?: CSSProperties;
}

export function HoverTip({ content, children, className, style }: HoverTipProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const { onMouseEnter, onMouseLeave, tip } = useClipTip(ref, content);

  return (
    <span
      ref={ref}
      className={className}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
      {tip}
    </span>
  );
}
