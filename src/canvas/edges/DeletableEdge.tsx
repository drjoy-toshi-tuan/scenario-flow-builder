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
  data,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const removeEdge = useFlowStore((s) => s.removeEdge);
  const t = useT();
  // Nhãn nhánh cố định (FAILED/NEXT): chỉ hiện khi hover, đặt ngay dưới chấm output.
  const sourceLabel = typeof data?.sourceLabel === 'string' ? data.sourceLabel : undefined;
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
      {/* Nhãn nhánh cố định: hiện khi hover, sát ngay dưới chấm output. */}
      {sourceLabel && hovered && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan edge-src-label"
            style={{ transform: `translate(-50%, 0) translate(${sourceX}px, ${sourceY + 9}px)` }}
          >
            {sourceLabel}
          </div>
        </EdgeLabelRenderer>
      )}
      <EdgeLabelRenderer>
        <div
          className={`nodrag nopan edge-toolbar${hasLabel ? ' edge-toolbar--labeled' : ''}`}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {/* Nhãn điều kiện (node nhánh tự do): căn GIỮA dây; nút xoá tách riêng bên phải
              (position absolute) nên không làm lệch tâm nhãn. */}
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
