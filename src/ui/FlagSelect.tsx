import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FlagInheritStamp } from './FlagInheritStamp';
import { Icon } from './icons';
import { useT } from './i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Pulldown TỰ VẼ cho Status/SMS flag (thay <select> native). Lý do: dropdown của
// <select> native do trình duyệt/OS render nên KHÔNG style được nội dung bên trong
// (không nhét được stamp), còn stamp phủ absolute lên mặt select thì che mất viền.
// Thiết kế theo yêu cầu team CS:
//   - Mặt pulldown (đóng) VÀ dòng đầu list đều hiện "stamp 継続/Carried + <flag> - <tên>".
//   - Dòng flag kế thừa (stamp Carried) nằm ĐẦU list; option trùng flag đó bị bỏ
//     khỏi phần còn lại của list (không có dòng lặp), KHÔNG có gạch ngang phân cách.
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

  // Chọn dòng Carried (đầu list) = xoá flag riêng -> quay về kế thừa (value '').
  // Value đặt tay TRÙNG flag kế thừa cũng coi như đang ở dòng Carried (list không
  // còn dòng lặp của flag đó nên không thể "chọn tay" giá trị trùng nữa).
  const onInheritedRow = value === '' || (!!inheritedValue && value === inheritedValue);
  const selected = !onInheritedRow && value !== '' ? options.find((o) => o.value === value) : undefined;
  // Bỏ option trùng flag kế thừa khỏi list — dòng Carried ở đầu đại diện cho nó.
  const listOptions = inheritedValue ? options.filter((o) => o.value !== inheritedValue) : options;
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
        {/* Mặt pulldown (đóng): đang kế thừa -> stamp 継続/Carried + "<flag> - <tên>";
            đã chọn flag riêng -> nhãn option; rỗng không kế thừa -> nhãn rỗng. */}
        {onInheritedRow && inheritedValue ? (
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <FlagInheritStamp />
            <span className="min-w-0 truncate text-[var(--bk-text-muted)]">{inheritedLabel}</span>
          </span>
        ) : selected ? (
          <span className="min-w-0 flex-1 truncate">{selected.label}</span>
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
            {/* Dòng ĐẦU list: có flag kế thừa -> stamp Carried + "<flag> - <tên>"
                (giống mặt pulldown đóng, không gạch phân cách); không kế thừa -> ô rỗng. */}
            <button
              type="button"
              role="option"
              aria-selected={onInheritedRow}
              title={inheritedValue ? `${t('flagInheritHint')}: ${inheritedLabel}` : undefined}
              onClick={() => pick('')}
              className={`${rowBase} ${onInheritedRow ? 'bg-[var(--bk-accent-soft)]' : ''}`}
            >
              {inheritedValue ? (
                <>
                  <FlagInheritStamp />
                  <span className="min-w-0 flex-1 truncate text-[var(--bk-text-muted)]">{inheritedLabel}</span>
                </>
              ) : (
                <span className="min-w-0 flex-1 truncate text-[var(--bk-text-muted)]">{emptyLabel}</span>
              )}
              {onInheritedRow && (
                <Icon icon="lucide:check" width={13} height={13} className="shrink-0 text-[var(--bk-accent)]" />
              )}
            </button>
            {listOptions.map((o) => (
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
