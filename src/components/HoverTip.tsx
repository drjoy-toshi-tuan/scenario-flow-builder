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

// Hook nền: quản lý vị trí + render portal tooltip. `show(rect, below)` mở tooltip
// canh giữa theo phần tử; `hide()` đóng. Dùng chung cho useClipTip / useHoverLabel.
function useFloatingTip(content: string) {
  const [pos, setPos] = useState<TipPos | null>(null);

  const show = (r: DOMRect, below: boolean) => {
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

  return { show, hide, tip };
}

// Hook: gắn onMouseEnter/onMouseLeave vào phần tử ref; trả thêm `tip` (portal) để
// render. Chỉ hiện tooltip khi phần tử thực sự bị cắt (tràn ngang hoặc dọc).
export function useClipTip(ref: RefObject<HTMLElement | null>, content: string) {
  const { show, hide, tip } = useFloatingTip(content);

  const onMouseEnter = () => {
    const el = ref.current;
    if (!el || !content) return;
    const clipped = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
    if (!clipped) return;
    const r = el.getBoundingClientRect();
    show(r, r.top < 90); // gần mép trên -> lật xuống dưới cho khỏi tràn màn hình
  };

  return { onMouseEnter, onMouseLeave: hide, tip };
}

// Hook: tooltip LUÔN hiện khi hover (không cần cắt chữ) — dùng cho nhãn nhánh trên
// chấm output ở đáy node. Khi output CHƯA nối dây thì không có edge mang nhãn, nên
// hover chấm là cách duy nhất xem nhánh này là nhánh nào (label ở Branch Settings).
// `placement` chọn phía hiện tooltip: 'bottom' (mặc định, cho chấm ở đáy node) hoặc
// 'top' (cho nút nằm sát mép DƯỚI màn hình — vd thanh công cụ canvas — kẻo bị cắt).
export function useHoverLabel(
  ref: RefObject<HTMLElement | null>,
  content: string,
  placement: 'top' | 'bottom' = 'bottom',
) {
  const { show, hide, tip } = useFloatingTip(content);

  const onMouseEnter = () => {
    const el = ref.current;
    if (!el || !content) return;
    show(el.getBoundingClientRect(), placement === 'bottom');
  };

  return { onMouseEnter, onMouseLeave: hide, tip };
}

// Nút icon có tooltip nổi LUÔN hiện khi hover (không dùng title gốc — tooltip
// trình duyệt hiện chậm và không style được). Dùng cho cụm nút thao tác trên
// dòng danh sách (Sửa / Duplicate / Xoá) và nút Ghi chú ở màn flow.
export function HoverLabelButton({
  label,
  className,
  disabled,
  placement = 'bottom',
  onClick,
  children,
}: {
  label: string; // text tooltip (đã dịch) — cũng là aria-label
  className?: string;
  disabled?: boolean;
  placement?: 'top' | 'bottom'; // phía hiện tooltip (mặc định dưới)
  onClick?: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const { onMouseEnter, onMouseLeave, tip } = useHoverLabel(ref, label, placement);

  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      disabled={disabled}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={() => {
        // Đóng tooltip trước khi mở modal/hành động (mouseleave có thể không bắn).
        onMouseLeave();
        onClick?.();
      }}
      className={className}
    >
      {children}
      {tip}
    </button>
  );
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
