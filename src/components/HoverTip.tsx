import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// ─────────────────────────────────────────────────────────────────────────────
// Phần tử văn bản tự cắt "…" (ellipsis). Khi hover mà nội dung BỊ TRÀN (dài hơn ô)
// -> hiện tooltip nổi chứa full text. Tooltip render qua portal ra <body> nên không
// bị cắt bởi overflow của khung cha (panel setting, preview trên canvas…).
// Không tràn -> không hiện tooltip (tránh nhiễu khi text vẫn đủ chỗ).
// ─────────────────────────────────────────────────────────────────────────────

interface HoverTipProps {
  content: string; // full text hiển thị trong tooltip
  children: ReactNode; // nội dung hiển thị trong ô (có thể bị cắt "…")
  className?: string; // class cho ô văn bản (mang CSS cắt "…")
  style?: CSSProperties;
}

interface TipPos {
  x: number;
  y: number;
  below: boolean;
}

export function HoverTip({ content, children, className, style }: HoverTipProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<TipPos | null>(null);

  const show = () => {
    const el = ref.current;
    if (!el || !content) return;
    // Chỉ hiện khi thực sự bị cắt (tràn ngang hoặc tràn dọc).
    const clipped = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
    if (!clipped) return;
    const r = el.getBoundingClientRect();
    const below = r.top < 90; // gần mép trên -> lật xuống dưới cho khỏi tràn màn hình
    const cx = Math.min(Math.max(r.left + r.width / 2, 200), window.innerWidth - 200);
    setPos({ x: cx, y: below ? r.bottom : r.top, below });
  };
  const hide = () => setPos(null);

  // Ẩn tooltip nếu cuộn/zoom (vị trí đã cũ) — an toàn cho trạng thái thoáng qua.
  useLayoutEffect(() => {
    if (!pos) return;
    const onScroll = () => setPos(null);
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [pos]);

  return (
    <span
      ref={ref}
      className={className}
      style={style}
      onMouseEnter={show}
      onMouseLeave={hide}
      title={content || undefined}
    >
      {children}
      {pos &&
        createPortal(
          <span
            className="bk-hovertip"
            style={{
              left: pos.x,
              top: pos.y,
              transform: pos.below
                ? 'translate(-50%, 8px)'
                : 'translate(-50%, calc(-100% - 8px))',
            }}
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  );
}
