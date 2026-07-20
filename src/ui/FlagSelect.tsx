import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FlagInheritStamp } from './FlagInheritStamp';
import { Icon } from './icons';
import { useT } from './i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Pulldown TỰ VẼ cho Status/SMS flag (thay <select> native). Lý do: dropdown của
// <select> native do trình duyệt/OS render nên KHÔNG style được nội dung bên trong
// (gạch <hr> phân cách bị vô hình, không nhét được stamp). Dropdown tự vẽ cho phép:
//   - Ô "chưa chọn" có flag kế thừa -> hiện đúng con dấu 継続/Carried NHỎ GỌN
//     ngay trong list (không còn chữ dài "Carried — <flag>" + gạch ngang tốn chỗ).
//   - Mặt pulldown (đóng) giữ nguyên kiểu stamp + nhãn flag kế thừa như cũ.
// Popup gắn qua portal + position fixed để không bị cắt bởi container cuộn
// (panel setting / bảng Announce List).
// ─────────────────────────────────────────────────────────────────────────────

export type FlagOption = { value: string; label: string };

// Chiều cao tối đa của list (px) — quá thì cuộn trong list.
const LIST_MAX_H = 240;

type PopupPos = { left: number; width: number; top?: number; bottom?: number };

export function FlagSelect({
  value,
  onChange,
  options,
  inheritedValue,
  inheritedLabel = '',
  emptyLabel,
  buttonClass,
  size = 'sm',
}: {
  value: string;
  onChange: (v: string) => void;
  options: FlagOption[];
  /** Flag kế thừa từ node phía trên (tự fill khi node chưa tự đặt). */
  inheritedValue?: string;
  inheritedLabel?: string;
  /** Nhãn ô rỗng khi KHÔNG có flag kế thừa (未選択 / ー). */
  emptyLabel: string;
  /** Style mặt pulldown (đóng) — truyền class sẵn có của từng màn để giữ giao diện. */
  buttonClass: string;
  size?: 'sm' | 'xs';
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<PopupPos | null>(null);

  // Tính chỗ đặt popup theo viewport; thiếu chỗ phía dưới thì lật lên trên.
  useLayoutEffect(() => {
    if (!open) return;
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom;
    setPos(
      below >= LIST_MAX_H + 8 || below >= r.top
        ? { left: r.left, width: r.width, top: r.bottom + 4 }
        : { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4 },
    );
  }, [open]);

  // Đóng khi: click ra ngoài, Escape, cuộn container ngoài, resize.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!btnRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && listRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const selected = value !== '' ? options.find((o) => o.value === value) : undefined;
  const rowText = size === 'xs' ? 'px-2 py-1 text-xs' : 'px-2.5 py-1.5 text-sm';
  const rowBase = `flex w-full items-center gap-1.5 rounded-md text-left text-[var(--bk-text)] transition hover:bg-[var(--bk-surface-2)] ${rowText}`;

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`${buttonClass} flex items-center gap-1.5 text-left`}
      >
        {/* Mặt pulldown (đóng): đã chọn -> nhãn option; rỗng + có kế thừa -> stamp
            継続/Carried + nhãn flag kế thừa (mờ); rỗng không kế thừa -> nhãn rỗng. */}
        {selected ? (
          <span className="min-w-0 flex-1 truncate">{selected.label}</span>
        ) : inheritedValue ? (
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <FlagInheritStamp />
            <span className="min-w-0 truncate text-[var(--bk-text-muted)]">{inheritedLabel}</span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[var(--bk-text-muted)]">{emptyLabel}</span>
        )}
        <Icon icon="lucide:chevron-down" width={14} height={14} className="shrink-0 text-[var(--bk-text-faint)]" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={listRef}
            role="listbox"
            style={{ position: 'fixed', ...pos, maxHeight: LIST_MAX_H }}
            className="z-50 overflow-auto rounded-xl border border-[var(--bk-border)] bg-[var(--bk-surface)] p-1 shadow-[var(--bk-shadow)]"
          >
            {/* Ô rỗng: có flag kế thừa -> CHỈ con dấu nhỏ gọn (không kèm chữ dài,
                không gạch phân cách — tiết kiệm chỗ theo yêu cầu CS). */}
            <button
              type="button"
              role="option"
              aria-selected={value === ''}
              title={inheritedValue ? `${t('flagInheritHint')}: ${inheritedLabel}` : undefined}
              onClick={() => pick('')}
              className={`${rowBase} ${value === '' ? 'bg-[var(--bk-accent-soft)]' : ''}`}
            >
              {inheritedValue ? <FlagInheritStamp /> : <span className="text-[var(--bk-text-muted)]">{emptyLabel}</span>}
            </button>
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                onClick={() => pick(o.value)}
                className={`${rowBase} ${o.value === value ? 'bg-[var(--bk-accent-soft)]' : ''}`}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.value === value && (
                  <Icon icon="lucide:check" width={13} height={13} className="shrink-0 text-[var(--bk-accent)]" />
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
