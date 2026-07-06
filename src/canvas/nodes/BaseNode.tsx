import { useRef, useState, type CSSProperties } from 'react';
import { Handle, NodeToolbar, Position, type NodeProps } from '@xyflow/react';
import type { RFNodeData } from '../irAdapter';
import type { NodeType } from '../../ir/types';
import { NODE_CONFIG } from '../../ui/nodeConfig';
import { PROPERTY_FIELDS, type PropertyField } from '../../ui/nodeSchema';
import { Icon } from '../../ui/icons';
import { useFlowStore } from '../../store/flowStore';
import { useT, type TKey } from '../../ui/i18n';
import { HoverTip } from '../../components/HoverTip';

// ─────────────────────────────────────────────────────────────────────────────
// Node card. Bố cục theo yêu cầu:
//   - Bên TRÁI: icon của loại node (tile màu accent).
//   - Bên phải xếp dọc: (trên) tên LOẠI module · (giữa) TÊN module · (dưới) mô tả.
// Node 'condition' có nhiều handle output ở đáy (mỗi nhánh 1 chấm), chia đều & giữa.
// Khi node được chọn -> hiện thanh công cụ phía trên (Sửa / Xoá) qua NodeToolbar.
// ─────────────────────────────────────────────────────────────────────────────

// Factory tạo 1 component node cho mỗi NodeType — tránh lặp markup.
export function makeNode(nodeType: NodeType) {
  const cfg = NODE_CONFIG[nodeType];
  const showTarget = cfg.showTarget !== false;
  const showSource = cfg.showSource !== false;

  function TypedNode({ id, data, selected }: NodeProps) {
    const d = data as unknown as RFNodeData;
    const description = pickDescription(d.nodeData);
    const handles = d.sourceHandles;
    const selectNode = useFlowStore((s) => s.selectNode);
    const requestDeleteNode = useFlowStore((s) => s.requestDeleteNode);
    const isPanning = useFlowStore((s) => s.isPanning);
    const t = useT();
    const [hovered, setHovered] = useState(false);
    // Giữ preview mở khi rê chuột từ node sang card preview (có khoảng hở 12px):
    // mouseleave hẹn ẩn sau 180ms; mouseenter card huỷ hẹn -> hover được vào card.
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const showPreview = () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
      setHovered(true);
    };
    const hidePreview = () => {
      hideTimer.current = setTimeout(() => setHovered(false), 180);
    };

    return (
      <div
        className={['bk-node', selected ? 'bk-node--selected' : ''].join(' ')}
        style={{ '--accent': cfg.color } as CSSProperties}
        onMouseEnter={showPreview}
        onMouseLeave={hidePreview}
      >
        {/* Hover / chọn node -> xem nhanh các property đang set (bên phải node). */}
        <NodeToolbar
          isVisible={(hovered || selected) && !isPanning}
          position={Position.Right}
          offset={12}
          align="start"
        >
          <div onMouseEnter={showPreview} onMouseLeave={hidePreview}>
            <NodePreview type={nodeType} data={d.nodeData} />
          </div>
        </NodeToolbar>

        {/* Thanh công cụ nổi phía trên node khi được chọn (bấm vào node).
            Ẩn trong lúc kéo/di chuyển canvas để không hiện lơ lửng sai chỗ. */}
        <NodeToolbar
          isVisible={selected && !isPanning}
          position={Position.Top}
          offset={10}
          align="center"
        >
          <div className="bk-node-toolbar">
            <button
              type="button"
              className="bk-node-toolbar-btn"
              onClick={() => selectNode(id)}
              title={t('editTitle')}
            >
              <Icon icon="lucide:pencil" width={14} height={14} />
              <span>{t('edit')}</span>
            </button>
            <span className="bk-node-toolbar-sep" />
            <button
              type="button"
              className="bk-node-toolbar-btn bk-node-toolbar-btn--danger"
              onClick={() => requestDeleteNode(id)}
              title={t('deleteNodeTitle')}
            >
              <Icon icon="lucide:trash-2" width={14} height={14} />
              <span>{t('delete')}</span>
            </button>
          </div>
        </NodeToolbar>

        {showTarget && <Handle type="target" position={Position.Top} className="bk-handle" />}

        <div className="bk-node-body">
          <div className="bk-node-icon">
            <Icon icon={cfg.icon} />
          </div>
          <div className="bk-node-text">
            <div className="bk-node-type">{cfg.typeLabel}</div>
            <div className="bk-node-name" title={d.label}>
              {d.label}
            </div>
            {description && (
              <div className="bk-node-desc" title={description}>
                {description}
              </div>
            )}
          </div>
        </div>

        {showSource &&
          (handles && handles.length > 0 ? (
            // Nhiều nhánh: chia đều dọc đáy node, đối xứng qua tâm.
            handles.map((h, i) => (
              <Handle
                key={h.id}
                id={h.id}
                type="source"
                position={Position.Bottom}
                className="bk-handle"
                title={h.label}
                style={{ left: `${((i + 1) / (handles.length + 1)) * 100}%` }}
              />
            ))
          ) : (
            // 1 output: chấm mặc định id 'default' (khớp sourceHandle của edge `next`).
            <Handle id="default" type="source" position={Position.Bottom} className="bk-handle" />
          ))}
      </div>
    );
  }

  return TypedNode;
}

// Mô tả là field do người dùng tự nhập (data.description). Không lấy text/prompt
// làm mô tả — những field đó chỉ sửa trong panel setting.
function pickDescription(data: Record<string, unknown>): string | null {
  const value = data.description;
  return typeof value === 'string' && value.trim() ? value : null;
}

// ── Preview property (hover/chọn node) ──────────────────────────────────────
// Card nhỏ bên phải node: liệt kê các property đang set. Giá trị dài (announce,
// prompt…) cắt 1 dòng + "…" cho vừa bề rộng card (xử lý bằng CSS text-ellipsis).
function NodePreview({ type, data }: { type: NodeType; data: Record<string, unknown> }) {
  const t = useT();
  const fields = PROPERTY_FIELDS[type].filter((f) => !f.showIf || f.showIf(data));
  const description = pickDescription(data);

  if (fields.length === 0 && !description) {
    return (
      <div className="bk-node-preview">
        <div className="bk-node-preview-empty">{t('noPropertyNote')}</div>
      </div>
    );
  }

  return (
    <div className="bk-node-preview">
      {description && (
        <div className="bk-node-preview-row">
          <span className="bk-node-preview-key">{t('description')}</span>
          {/* Giá trị dài bị cắt "…" -> hover xem đầy đủ (tooltip nổi). */}
          <HoverTip className="bk-node-preview-val" content={description}>
            {description}
          </HoverTip>
        </div>
      )}
      {fields.map((f) => {
        const val = formatFieldValue(f, data, t);
        return (
          <div key={f.key} className="bk-node-preview-row">
            <span className="bk-node-preview-key">{t(f.labelKey)}</span>
            <HoverTip className="bk-node-preview-val" content={val}>
              {val || '—'}
            </HoverTip>
          </div>
        );
      })}
    </div>
  );
}

// Giá trị hiển thị của 1 field: select/yesno -> nhãn lựa chọn; còn lại -> chuỗi thô.
function formatFieldValue(
  field: PropertyField,
  data: Record<string, unknown>,
  t: (key: TKey) => string,
): string {
  const raw = data[field.key];
  // Chưa lưu vào data -> lấy giá trị mặc định (giống ô nhập trong panel), tránh hiện "—"
  // dù field vốn có default (vd Voice Type, Retry Count).
  const value =
    typeof raw === 'string' ? raw : typeof raw === 'number' ? String(raw) : field.default ?? '';
  if ((field.kind === 'select' || field.kind === 'yesno') && value) {
    const opt = field.options?.find((o) => o.value === value);
    if (opt) return opt.labelKey ? t(opt.labelKey) : opt.label ?? value;
  }
  return value.replace(/\s+/g, ' ').trim();
}
