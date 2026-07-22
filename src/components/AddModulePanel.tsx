import { useEffect, useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useFlowStore } from '../store/flowStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import { NODE_CONFIG, ADDABLE_NODE_TYPES, CS_NODE_TYPES, nodeTypeLabel } from '../ui/nodeConfig';
import { Icon } from '../ui/icons';
import { useT } from '../ui/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// "Thêm module": nút + mở palette liệt kê các loại node có thể thêm (icon + tên).
// 2 cách thêm:
//   - Click 1 loại -> tạo node tại giữa vùng nhìn hiện tại rồi chọn nó (mở setting).
//   - Kéo-thả 1 loại xuống canvas -> tạo node tại đúng vị trí thả (xem FlowCanvas.onDrop).
// Đặt trong <Panel> của React Flow nên dùng được useReactFlow (screenToFlowPosition).
// ─────────────────────────────────────────────────────────────────────────────

// Kiểu dữ liệu dataTransfer khi kéo module từ palette -> canvas.
export const DND_MIME = 'application/bk-node-type';

export function AddModulePanel() {
  // Mở/đóng qua store (canvasPanel) để loại trừ lẫn nhau với panel Main/Sub Flow.
  const canvasPanel = useFlowStore((s) => s.canvasPanel);
  const setCanvasPanel = useFlowStore((s) => s.setCanvasPanel);
  const open = canvasPanel === 'addNode';
  const setOpen = (v: boolean) => setCanvasPanel(v ? 'addNode' : null);
  // `render` giữ menu mounted trong lúc chạy animation ĐÓNG (thu nhỏ + mờ dần).
  const [render, setRender] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) setRender(true);
  }, [open]);
  // Click ra ngoài panel -> tự đóng (đồng bộ hành vi với các panel khác). Lưu ý:
  //   - Đọc state MỚI NHẤT: nút panel Flows đổi canvasPanel ngay tại mousedown —
  //     panel này không còn active thì đừng ghi đè về null.
  //   - Dùng composedPath() thay vì contains(e.target): mousedown làm React
  //     re-render có thể THAY icon svg (target bị detach) -> contains trả false sai.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (useFlowStore.getState().canvasPanel !== 'addNode') return;
      if (wrapRef.current && !e.composedPath().includes(wrapRef.current)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // setOpen ổn định (từ store) — không cần vào deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const addNode = useFlowStore((s) => s.addNode);
  const nodeCount = useFlowStore((s) => s.ir?.nodes.length ?? 0);
  // Đã có node start? -> không cho thêm start nữa (start là điểm bắt đầu duy nhất).
  const hasStart = useFlowStore((s) => s.ir?.nodes.some((n) => n.type === 'start') ?? false);
  // Node Start CHỈ có ở main flow — đang mở sub flow thì không thêm được.
  const inSubflow = useFlowStore((s) => s.activeFlowId !== 'main');
  const { screenToFlowPosition } = useReactFlow();
  const csMode = useWorkspaceStore((s) => s.mode === 'cs');
  const addableTypes = csMode
    ? ADDABLE_NODE_TYPES.filter((type) => CS_NODE_TYPES.includes(type))
    : ADDABLE_NODE_TYPES;
  const t = useT();

  const isDisabled = (type: (typeof ADDABLE_NODE_TYPES)[number]) =>
    type === 'start' && (hasStart || inSubflow);
  const disabledTitle = (type: (typeof ADDABLE_NODE_TYPES)[number]) =>
    type === 'start' && inSubflow ? t('startMainOnly') : t('startExists');

  const handleAdd = (type: (typeof ADDABLE_NODE_TYPES)[number]) => {
    if (isDisabled(type)) return;
    // Giữa vùng nhìn, lệch nhẹ theo số node để các node mới không đè khít lên nhau.
    const stagger = (nodeCount % 6) * 28;
    const center = screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
    addNode(type, { x: center.x + stagger, y: center.y + stagger });
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        // Toggle tại mousedown (tránh mất click khi panel Flows đóng cùng lúc — xem FlowsPanel);
        // onClick giữ cho bàn phím (Enter/Space sinh click với detail === 0).
        onMouseDown={() => setOpen(!open)}
        onClick={(e) => {
          if (e.detail === 0) setOpen(!open);
        }}
        className="flex items-center gap-2 rounded-xl border border-[var(--bk-border)] bg-[var(--bk-surface)] px-3 py-2 text-sm font-semibold text-[var(--bk-text)] shadow-[var(--bk-shadow)] transition hover:border-[var(--bk-accent)] hover:text-[var(--bk-accent)]"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Icon icon="lucide:plus" className="text-[var(--bk-accent)]" width={17} height={17} />
        <span>{t('addModule')}</span>
        <Icon
          icon="lucide:chevron-down"
          width={15}
          height={15}
          className={`text-[var(--bk-text-faint)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {render && (
        <div
          role="menu"
          onAnimationEnd={(e) => {
            // Kết thúc animation ĐÓNG -> gỡ menu khỏi DOM.
            if (e.target === e.currentTarget && !open) setRender(false);
          }}
          className={`bk-addmenu ${open ? 'bk-addmenu--in' : 'bk-addmenu--out'} absolute left-0 top-full z-20 mt-2 w-60 overflow-hidden rounded-2xl border border-[var(--bk-border)] bg-[var(--bk-surface)] p-1.5 shadow-[var(--bk-shadow)]`}
        >
          <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--bk-text-faint)]">
            {t('chooseType')}
          </div>
          {/* Giới hạn chiều cao ~8 node + cuộn dọc: danh sách node dài hơn 1 màn hình
              (nhất là màn TS đủ loại node) trước đây tràn khỏi khung nhìn.
              Mỗi hàng ~3rem (icon h-8 + py-2) -> 8 node ≈ 24rem. */}
          <div className="max-h-[24rem] overflow-y-auto overscroll-contain">
          {addableTypes.map((type) => {
            const cfg = NODE_CONFIG[type];
            const disabled = isDisabled(type);
            return (
              <button
                key={type}
                type="button"
                role="menuitem"
                disabled={disabled}
                draggable={!disabled}
                title={disabled ? disabledTitle(type) : undefined}
                onDragStart={(e) => {
                  if (disabled) {
                    e.preventDefault();
                    return;
                  }
                  e.dataTransfer.setData(DND_MIME, type);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onClick={() => handleAdd(type)}
                className={[
                  'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition',
                  disabled
                    ? 'cursor-not-allowed opacity-40'
                    : 'cursor-grab hover:bg-[var(--bk-surface-2)] active:cursor-grabbing',
                ].join(' ')}
              >
                <span
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-lg text-[17px]"
                  style={{
                    color: cfg.color,
                    background: `color-mix(in srgb, ${cfg.color} 15%, transparent)`,
                  }}
                >
                  <Icon icon={cfg.icon} />
                </span>
                <span className="text-sm font-medium text-[var(--bk-text)]">
                  {nodeTypeLabel(type, csMode)}
                </span>
              </button>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}
