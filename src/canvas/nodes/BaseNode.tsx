import type { CSSProperties } from 'react';
import { Handle, NodeToolbar, Position, type NodeProps } from '@xyflow/react';
import type { RFNodeData } from '../irAdapter';
import type { NodeType } from '../../ir/types';
import { NODE_CONFIG } from '../../ui/nodeConfig';
import { Icon } from '../../ui/icons';
import { useFlowStore } from '../../store/flowStore';

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
    const removeNode = useFlowStore((s) => s.removeNode);

    return (
      <div
        className={['bk-node', selected ? 'bk-node--selected' : ''].join(' ')}
        style={{ '--accent': cfg.color } as CSSProperties}
      >
        {/* Thanh công cụ nổi phía trên node khi được chọn (bấm vào node). */}
        <NodeToolbar position={Position.Top} offset={10} align="center">
          <div className="bk-node-toolbar">
            <button
              type="button"
              className="bk-node-toolbar-btn"
              onClick={() => selectNode(id)}
              title="Chỉnh sửa"
            >
              <Icon icon="lucide:pencil" width={14} height={14} />
              <span>Sửa</span>
            </button>
            <span className="bk-node-toolbar-sep" />
            <button
              type="button"
              className="bk-node-toolbar-btn bk-node-toolbar-btn--danger"
              onClick={() => removeNode(id)}
              title="Xoá module"
            >
              <Icon icon="lucide:trash-2" width={14} height={14} />
              <span>Xoá</span>
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
            {description ? (
              <div className="bk-node-desc" title={description}>
                {description}
              </div>
            ) : (
              <div className="bk-node-desc bk-node-desc--empty">Chưa có mô tả</div>
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
            <Handle type="source" position={Position.Bottom} className="bk-handle" />
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
