import { useEffect, useRef, useState } from 'react';
import { useFlowStore } from '../store/flowStore';
import { useT } from '../ui/i18n';
import { Icon } from '../ui/icons';
import { IvrPropertyModal } from './IvrPropertyModal';

// ─────────────────────────────────────────────────────────────────────────────
// Nút icon ở header trái (màn canvas) mở panel Main Flow / Sub Flow:
//   - Main Flow (tên = tên flow) và danh sách Sub Flow — click để chuyển canvas.
//   - Nút + (line-md:plus, giống "Tạo flow mới" ở màn quản lý YAML) tạo sub flow.
// Mở/đóng qua store.canvasPanel nên tự loại trừ với panel "Thêm node" (cùng khu).
// ─────────────────────────────────────────────────────────────────────────────

export function FlowsPanel() {
  const canvasPanel = useFlowStore((s) => s.canvasPanel);
  const setCanvasPanel = useFlowStore((s) => s.setCanvasPanel);
  const open = canvasPanel === 'flows';
  const setOpen = (v: boolean) => setCanvasPanel(v ? 'flows' : null);

  // Giữ panel mounted trong lúc chạy animation đóng (giống AddModulePanel).
  const [render, setRender] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) setRender(true);
  }, [open]);
  // Click ra ngoài panel -> tự đóng. Lưu ý 2 bẫy:
  //   - Đọc state MỚI NHẤT: nút toggle của panel kia đổi canvasPanel ngay tại
  //     mousedown — panel này không còn active thì đừng ghi đè về null.
  //   - Dùng composedPath() thay vì contains(e.target): mousedown làm React
  //     re-render có thể THAY icon svg (target bị detach) -> contains trả false sai.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (useFlowStore.getState().canvasPanel !== 'flows') return;
      if (wrapRef.current && !e.composedPath().includes(wrapRef.current)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // setOpen ổn định (từ store) — không cần vào deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ir = useFlowStore((s) => s.ir);
  const activeFlowId = useFlowStore((s) => s.activeFlowId);
  const switchFlow = useFlowStore((s) => s.switchFlow);
  const createSubflow = useFlowStore((s) => s.createSubflow);
  const t = useT();

  // Modal Cài đặt IVR Property (chuyển từ menu header về đây — cùng chỗ cấu hình flow).
  const [ivrOpen, setIvrOpen] = useState(false);

  // Ô nhập tên khi bấm nút tạo sub flow (inline trong panel).
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  useEffect(() => {
    if (!open) {
      setCreating(false);
      setNewName('');
    }
  }, [open]);

  const subflows = ir?.subflows ?? [];

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    await createSubflow(name); // tự chuyển sang sub flow mới + đóng panel (store)
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        // Toggle ngay tại mousedown: nếu panel "Thêm node" đang mở, việc nó đóng làm
        // React thay SVG dưới con trỏ giữa mousedown-mouseup -> browser nuốt mất click.
        // onClick chỉ giữ cho bàn phím (Enter/Space sinh click với detail === 0).
        onMouseDown={() => setOpen(!open)}
        onClick={(e) => {
          if (e.detail === 0) setOpen(!open);
        }}
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--bk-accent-soft)] text-lg text-[var(--bk-accent)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-95"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('flowsTitle')}
        title={t('flowsTitle')}
      >
        <Icon icon="svg-spinners:blocks-scale" width={22} height={22} />
      </button>

      {render && (
        <div
          role="menu"
          onAnimationEnd={(e) => {
            if (e.target === e.currentTarget && !open) setRender(false);
          }}
          className={`bk-addmenu ${open ? 'bk-addmenu--in' : 'bk-addmenu--out'} absolute left-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-2xl border border-[var(--bk-border)] bg-[var(--bk-surface)] p-2 shadow-[var(--bk-shadow)]`}
        >
          {/* ── Main Flow ── */}
          <div className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]">
            {t('mainFlowSection')}
          </div>
          <FlowItem
            icon="tabler:square-rounded-letter-m-filled"
            name={ir?.meta.name ?? 'Main Flow'}
            active={activeFlowId === 'main'}
            onClick={() => void switchFlow('main')}
          />

          {/* ── Sub Flow ── */}
          <div className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]">
            {t('subFlowSection')}
          </div>
          {subflows.length === 0 && !creating && (
            <div className="px-2.5 pb-1 text-xs text-[var(--bk-text-faint)]">{t('subFlowEmpty')}</div>
          )}
          {subflows.map((s) => (
            <FlowItem
              key={s.id}
              icon="tabler:square-rounded-letter-s-filled"
              name={s.name}
              active={activeFlowId === s.id}
              onClick={() => void switchFlow(s.id)}
            />
          ))}

          {/* Tạo sub flow: bấm + -> hiện ô nhập tên, Enter để tạo. */}
          {creating ? (
            <div className="mt-1 flex items-center gap-1.5 px-1 pb-1">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreate();
                  if (e.key === 'Escape') setCreating(false);
                }}
                placeholder={t('subflowNamePlaceholder')}
                className="w-full min-w-0 flex-1 rounded-lg border border-[var(--bk-border)] bg-[var(--bk-bg)] px-2.5 py-1.5 text-sm text-[var(--bk-text)] outline-none focus:border-[var(--bk-accent)]"
              />
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={!newName.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#16a34a] text-white transition hover:opacity-90 disabled:opacity-50"
                title={t('createSubflow')}
                aria-label={t('createSubflow')}
              >
                <Icon icon="lucide:check" width={16} height={16} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="mt-1 flex w-full items-center gap-2 rounded-xl border border-dashed border-[var(--bk-border)] px-2.5 py-2 text-sm font-medium text-[var(--bk-text-muted)] transition hover:border-[var(--bk-accent)] hover:text-[var(--bk-accent)]"
            >
              <Icon icon="line-md:plus" width={16} height={16} />
              {t('createSubflow')}
            </button>
          )}

          {/* ── Cài đặt IVR Property — cấu hình chung của flow, đặt cùng chỗ Main/Sub Flow. ── */}
          <div className="bk-menu-sep" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setIvrOpen(true);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-sm font-medium text-[var(--bk-text)] transition hover:bg-[var(--bk-surface-2)]"
          >
            <Icon icon="majesticons:code-block-line" width={16} height={16} className="text-[var(--bk-accent)]" />
            {t('ivrProperty')}
          </button>
        </div>
      )}

      {ivrOpen && <IvrPropertyModal onClose={() => setIvrOpen(false)} />}
    </div>
  );
}

// 1 dòng flow trong panel: icon + tên; flow đang mở tô nền accent.
function FlowItem({
  icon,
  name,
  active,
  onClick,
}: {
  icon: string;
  name: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={[
        'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition',
        active
          ? 'bg-[var(--bk-accent-soft)] font-semibold text-[var(--bk-accent)]'
          : 'text-[var(--bk-text)] hover:bg-[var(--bk-surface-2)]',
      ].join(' ')}
    >
      <Icon icon={icon} width={16} height={16} className={active ? '' : 'text-[var(--bk-text-faint)]'} />
      <span className="min-w-0 flex-1 truncate text-sm" title={name}>
        {name}
      </span>
      {active && <Icon icon="lucide:circle-check" width={14} height={14} />}
    </button>
  );
}
