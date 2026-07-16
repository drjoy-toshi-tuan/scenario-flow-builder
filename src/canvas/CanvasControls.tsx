import { useEffect, useRef } from 'react';
import { useReactFlow, useStore, useStoreApi } from '@xyflow/react';
import { useFlowStore } from '../store/flowStore';
import { useT } from '../ui/i18n';
import { Icon } from '../ui/icons';
import { HoverLabelButton } from '../components/HoverTip';

// ─────────────────────────────────────────────────────────────────────────────
// Thanh công cụ canvas (thay <Controls> mặc định của React Flow) — GIỮ kiểu nút
// "cũ" (phẳng, gộp 1 khối, có đường kẻ ngăn) nhưng nằm NGANG và trượt ra sau 1 nút:
//   - Nút toggle: đóng = icon 3 cột (fluent:column-triple-20-filled); mở = dấu X
//     (báo hiệu bấm để đóng). Bấm mở/đóng dãy nút zoom/fit/lock/undo/redo.
//   - Mở/đóng qua store.canvasPanel === 'controls' -> TỰ loại trừ với panel
//     "Thêm node" / "Main-Sub Flow"; click ra ngoài cũng đóng.
// Hover mỗi nút hiện tooltip (VI/JA theo ngôn ngữ hiện tại).
// ─────────────────────────────────────────────────────────────────────────────

export function CanvasControls() {
  // Mở/đóng qua store để loại trừ với các panel canvas khác (spec chung).
  const canvasPanel = useFlowStore((s) => s.canvasPanel);
  const setCanvasPanel = useFlowStore((s) => s.setCanvasPanel);
  const open = canvasPanel === 'controls';
  const setOpen = (v: boolean) => setCanvasPanel(v ? 'controls' : null);

  const undo = useFlowStore((s) => s.undo);
  const redo = useFlowStore((s) => s.redo);
  const canUndo = useFlowStore((s) => s.past.length > 0);
  const canRedo = useFlowStore((s) => s.future.length > 0);

  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const store = useStoreApi();
  // Khoá tương tác = nodesDraggable && nodesConnectable && elementsSelectable (đồng
  // bộ với phím tắt Ctrl/⌘+Shift+L trong FlowCanvas). "Đang mở khoá" khi cả 3 bật.
  const interactive = useStore(
    (s) => s.nodesDraggable && s.nodesConnectable && s.elementsSelectable,
  );
  const toggleInteractivity = () => {
    const next = !interactive;
    store.setState({
      nodesDraggable: next,
      nodesConnectable: next,
      elementsSelectable: next,
    });
  };

  const t = useT();

  const wrapRef = useRef<HTMLDivElement>(null);
  // Click ra ngoài -> tự đóng (giống AddModulePanel/FlowsPanel). Đọc state mới nhất
  // để nút panel khác đổi canvasPanel ngay tại mousedown không bị ghi đè về null.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (useFlowStore.getState().canvasPanel !== 'controls') return;
      if (wrapRef.current && !e.composedPath().includes(wrapRef.current)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
    // setOpen ổn định (từ store) — không cần vào deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={wrapRef} className="bk-ctrlbar">
      <button
        type="button"
        // Toggle tại mousedown (tránh mất click khi panel khác đóng cùng lúc làm
        // React thay SVG dưới con trỏ); onClick giữ cho bàn phím (detail === 0).
        onMouseDown={() => setOpen(!open)}
        onClick={(e) => {
          if (e.detail === 0) setOpen(!open);
        }}
        className={`bk-ctrlbar-btn ${open ? 'bk-ctrlbar-btn--active' : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={open ? t('ctrlClose') : t('ctrlTools')}
        title={open ? t('ctrlClose') : t('ctrlTools')}
      >
        <Icon icon={open ? 'lucide:x' : 'fluent:column-triple-20-filled'} width={16} height={16} />
      </button>

      {/* Dãy nút LUÔN mounted (inert khi đóng nhờ pointer-events) để trượt được cả 2 chiều. */}
      <div
        role="menu"
        aria-hidden={!open}
        className={`bk-ctrlbar-tray ${open ? 'bk-ctrlbar-tray--open' : ''}`}
      >
        <HoverLabelButton label={t('ctrlZoomIn')} className="bk-ctrlbar-btn" placement="top" onClick={() => void zoomIn({ duration: 200 })}>
          <Icon icon="fluent:zoom-in-20-filled" width={16} height={16} />
        </HoverLabelButton>
        <HoverLabelButton label={t('ctrlZoomOut')} className="bk-ctrlbar-btn" placement="top" onClick={() => void zoomOut({ duration: 200 })}>
          <Icon icon="fluent:zoom-out-20-filled" width={16} height={16} />
        </HoverLabelButton>
        <HoverLabelButton label={t('ctrlFitView')} className="bk-ctrlbar-btn" placement="top" onClick={() => void fitView({ padding: 0.2, duration: 250 })}>
          <Icon icon="fluent:arrow-fit-20-filled" width={16} height={16} />
        </HoverLabelButton>
        <HoverLabelButton
          label={interactive ? t('ctrlLock') : t('ctrlUnlock')}
          className="bk-ctrlbar-btn"
          placement="top"
          onClick={toggleInteractivity}
        >
          <Icon
            icon={interactive ? 'fluent:lock-open-20-filled' : 'fluent:lock-closed-20-filled'}
            width={16}
            height={16}
          />
        </HoverLabelButton>
        <HoverLabelButton label={t('undo')} className="bk-ctrlbar-btn" placement="top" disabled={!canUndo} onClick={() => undo()}>
          <Icon icon="fa7-solid:undo-alt" width={13} height={13} />
        </HoverLabelButton>
        <HoverLabelButton label={t('redo')} className="bk-ctrlbar-btn" placement="top" disabled={!canRedo} onClick={() => redo()}>
          <Icon icon="fa7-solid:redo-alt" width={13} height={13} />
        </HoverLabelButton>
      </div>
    </div>
  );
}
