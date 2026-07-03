import { useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import { useFlowStore } from '../../store/flowStore';
import { Icon } from '../../ui/icons';
import { useT } from '../../ui/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Custom edge có nút xoá (thùng rác) hiện khi hover vào dây — hành vi giống n8n.
// Dùng smooth-step: dây gấp khúc (chữ S), các góc gấp được bo tròn; nếu source &
// target thẳng hàng thì tự động là đường thẳng. Hover -> hiện icon xoá edge.
// ─────────────────────────────────────────────────────────────────────────────

export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  markerEnd,
  style,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const removeEdge = useFlowStore((s) => s.removeEdge);
  const t = useT();
  const hasLabel = typeof label === 'string' && label.length > 0;

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 14, // bo tròn tại các điểm gấp khúc
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {/* Path trong suốt, dày — vùng bắt hover rộng hơn để dễ trỏ vào dây. */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={22}
        style={{ cursor: 'pointer' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      {/* Nhãn điều kiện căn GIỮA dây (mọi loại node — cố định hay tự do đều như nhau);
          nút xoá tách hẳn sang phải (position absolute, cách 1 khoảng cố định) nên không
          đè lên nhãn và không làm lệch tâm nhãn. Nhãn luôn hiện, nút xoá hiện khi hover. */}
      <EdgeLabelRenderer>
        <div
          className={`nodrag nopan edge-toolbar${hasLabel ? ' edge-toolbar--labeled' : ''}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {hasLabel && <span className="edge-label">{label}</span>}
          <button
            type="button"
            title={t('deleteEdgeTitle')}
            aria-label={t('deleteEdgeTitle')}
            className="edge-trash"
            style={{ opacity: hovered ? 1 : 0 }}
            onClick={(e) => {
              e.stopPropagation();
              removeEdge(id);
            }}
          >
            <Icon icon="lucide:trash-2" />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export const edgeTypes = { deletable: DeletableEdge };
