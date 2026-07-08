import { useEffect, useMemo, useRef, useState } from 'react';
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
  // Đổi tên sub flow: id đang sửa + giá trị đang gõ (inline, giống ô tạo mới).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  // Sub flow chờ xác nhận xoá (mở modal).
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    if (!open) {
      setCreating(false);
      setNewName('');
      setEditingId(null);
      setEditName('');
    }
  }, [open]);

  const subflows = ir?.subflows ?? [];

  // Icon spinner (SMIL loop) phải GIỮ NGUYÊN element giữa các lần render: nếu để
  // re-render, Iconify sinh lại các thẻ <animate> (id mới) bên trong <svg> cũ —
  // begin="0" trỏ vào timeline đã chạy qua 0 nên animation chết hẳn sau lần click đầu.
  const spinnerIcon = useMemo(
    () => <Icon icon="svg-spinners:blocks-scale" width={22} height={22} />,
    [],
  );

  const renameSubflow = useFlowStore((s) => s.renameSubflow);
  const deleteSubflow = useFlowStore((s) => s.deleteSubflow);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    await createSubflow(name); // tự chuyển sang sub flow mới + đóng panel (store)
  };

  const handleRename = () => {
    if (!editingId || !editName.trim()) return;
    renameSubflow(editingId, editName);
    setEditingId(null);
    setEditName('');
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
        {spinnerIcon}
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
          {subflows.map((s) =>
            editingId === s.id ? (
              // Đang đổi tên: input inline + nút xác nhận (giống ô tạo mới).
              <div key={s.id} className="flex items-center gap-1.5 px-1 py-0.5">
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename();
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  placeholder={t('subflowNamePlaceholder')}
                  className="w-full min-w-0 flex-1 rounded-lg border border-[var(--bk-border)] bg-[var(--bk-bg)] px-2.5 py-1.5 text-sm text-[var(--bk-text)] outline-none focus:border-[var(--bk-accent)]"
                />
                <button
                  type="button"
                  onClick={handleRename}
                  disabled={!editName.trim()}
                  className={[
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-200',
                    editName.trim()
                      ? 'text-[#22c55e] hover:-translate-y-0.5 hover:brightness-110 hover:drop-shadow-md active:translate-y-0 active:scale-95'
                      : 'cursor-not-allowed text-[var(--bk-text-faint)] opacity-60',
                  ].join(' ')}
                  title={t('renameSubflow')}
                  aria-label={t('renameSubflow')}
                >
                  <Icon
                    key={editName.trim() ? 'on' : 'off'}
                    icon="line-md:square-filled-to-confirm-square-filled-transition"
                    width={26}
                    height={26}
                  />
                </button>
              </div>
            ) : (
              <FlowItem
                key={s.id}
                icon="tabler:square-rounded-letter-s-filled"
                name={s.name}
                active={activeFlowId === s.id}
                onClick={() => void switchFlow(s.id)}
                onRename={() => {
                  setEditingId(s.id);
                  setEditName(s.name);
                }}
                onDelete={() => setDeleteTarget({ id: s.id, name: s.name })}
              />
            ),
          )}

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
                className={[
                  // Icon tự vẽ hình nút (square-filled + animation) nên KHÔNG cần nền;
                  // chỉ thêm hiệu ứng hover: nhấc nhẹ + sáng lên, active scale.
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-200',
                  newName.trim()
                    ? 'text-[#22c55e] hover:-translate-y-0.5 hover:brightness-110 hover:drop-shadow-md active:translate-y-0 active:scale-95'
                    : // Chưa nhập tên: trung tính, mờ — không gào màu khi chưa bấm được.
                      'cursor-not-allowed text-[var(--bk-text-faint)] opacity-60',
                ].join(' ')}
                title={t('createSubflow')}
                aria-label={t('createSubflow')}
              >
                {/* key theo trạng thái để animation vẽ nét của icon chạy lại khi nút "sáng" lên */}
                <Icon key={newName.trim() ? 'on' : 'off'} icon="line-md:square-filled-to-confirm-square-filled-transition" width={26} height={26} />
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
            <Icon icon="line-md:text-box" width={16} height={16} className="text-[var(--bk-accent)]" />
            {t('ivrProperty')}
          </button>
        </div>
      )}

      {ivrOpen && <IvrPropertyModal onClose={() => setIvrOpen(false)} />}

      {/* Modal xác nhận xoá sub flow (node bên trong sẽ mất, Jump trỏ tới sẽ mất đích). */}
      {deleteTarget && (
        <div
          className="bk-modal-overlay bk-modal-overlay--fixed"
          role="dialog"
          aria-modal="true"
          onClick={() => setDeleteTarget(null)}
        >
          <div className="bk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center gap-2 text-sm font-bold text-[var(--bk-text)]">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[color-mix(in_srgb,#dc2626_14%,transparent)] text-[#dc2626]">
                <Icon icon="lucide:trash-2" width={15} height={15} />
              </span>
              {t('deleteSubflowTitle')}
            </div>
            <p className="mb-4 text-sm leading-relaxed text-[var(--bk-text-muted)]">
              {t('deleteSubflowConfirm', { name: deleteTarget.name })}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-[var(--bk-border)] px-4 py-2 text-sm font-semibold text-[var(--bk-text-muted)] transition hover:bg-[var(--bk-surface-2)] hover:text-[var(--bk-text)]"
              >
                {t('btnCancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteSubflow(deleteTarget.id);
                  setDeleteTarget(null);
                }}
                className="rounded-lg bg-[#dc2626] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-95"
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 1 dòng flow trong panel: icon + tên; flow đang mở tô nền accent.
// Sub flow (có onRename/onDelete): hover hiện nút đổi tên / xoá bên phải.
function FlowItem({
  icon,
  name,
  active,
  onClick,
  onRename,
  onDelete,
}: {
  icon: string;
  name: string;
  active: boolean;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const t = useT();
  return (
    <div
      className={[
        'group flex w-full items-center gap-1 rounded-xl transition',
        active ? 'bg-[var(--bk-accent-soft)]' : 'hover:bg-[var(--bk-surface-2)]',
      ].join(' ')}
    >
      <button
        type="button"
        role="menuitem"
        onClick={onClick}
        className={[
          'flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left',
          active ? 'font-semibold text-[var(--bk-accent)]' : 'text-[var(--bk-text)]',
        ].join(' ')}
      >
        <Icon icon={icon} width={16} height={16} className={active ? '' : 'text-[var(--bk-text-faint)]'} />
        <span className="min-w-0 flex-1 truncate text-sm" title={name}>
          {name}
        </span>
      </button>
      {(onRename || onDelete) && (
        // Hiện khi hover HOẶC khi sub flow này đang được chọn (click vào là thấy luôn).
        // Nằm BÊN TRÁI icon check (icon chọn) — check luôn ở mép phải cùng.
        <div
          className={[
            'flex shrink-0 items-center gap-0.5 transition-opacity',
            // Active: icon check theo sau tự có mép phải (mr-2.5); còn lại tự chừa lề.
            active ? 'opacity-100' : 'pr-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
          ].join(' ')}
        >
          {onRename && (
            <button
              type="button"
              onClick={onRename}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--bk-text-faint)] transition hover:bg-[var(--bk-accent-soft)] hover:text-[var(--bk-accent)]"
              title={t('renameSubflow')}
              aria-label={t('renameSubflow')}
            >
              <Icon icon="lucide:pencil" width={14} height={14} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--bk-text-faint)] transition hover:bg-[color-mix(in_srgb,#dc2626_12%,transparent)] hover:text-rose-500"
              title={t('deleteSubflowTitle')}
              aria-label={t('deleteSubflowTitle')}
            >
              <Icon icon="lucide:trash-2" width={14} height={14} />
            </button>
          )}
        </div>
      )}
      {/* Icon check (icon chọn) — mép phải cùng, luôn sau 2 nút đổi tên/xoá. */}
      {active && (
        <Icon
          icon="lucide:circle-check"
          width={14}
          height={14}
          className="mr-2.5 shrink-0 text-[var(--bk-accent)]"
        />
      )}
    </div>
  );
}
