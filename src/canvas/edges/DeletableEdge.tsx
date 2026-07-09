import { useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  getSmoothStepPath,
  useInternalNode,
  type EdgeProps,
  type InternalNode,
} from '@xyflow/react';
import { useFlowStore } from '../../store/flowStore';
import type { RFEdgeData } from '../irAdapter';
import { Icon } from '../../ui/icons';
import { useT } from '../../ui/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Custom edge có nút xoá (thùng rác) hiện khi hover vào dây — hành vi giống n8n.
// Dùng smooth-step: dây gấp khúc (chữ S), các góc gấp được bo tròn; nếu source &
// target thẳng hàng thì tự động là đường thẳng. Hover -> hiện icon xoá edge.
//
// Trường hợp DÂY NỐI VÒNG LÊN TRÊN (retry/loop: đích nằm CAO hơn nguồn): smooth-step
// mặc định luồn thẳng đứng giữa 2 node nên dây đâm xuyên qua thân node. Ở đây tự dựng
// đường gấp khúc "lách" hẳn ra một bên: nếu handle nguồn nằm nửa TRÁI thì vòng sang
// trái, nửa PHẢI thì vòng sang phải — luôn đi ngoài mép node để không cắt qua node.
// ─────────────────────────────────────────────────────────────────────────────

// Khoảng đệm dây chừa ra khỏi mép node khi vòng.
const LOOP_LANE = 44; // làn dọc cách mép ngoài node
const LOOP_GAP = 22; // đệm trên/dưới node trước khi rẽ ngang
const LOOP_RADIUS = 14; // bo góc gấp khúc (khớp smooth-step)

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
  cx: number;
}

function boxOf(node: InternalNode | undefined): Box | null {
  if (!node) return null;
  const { x, y } = node.internals.positionAbsolute;
  const w = node.measured?.width ?? 0;
  const h = node.measured?.height ?? 0;
  if (!w || !h) return null;
  return { left: x, right: x + w, top: y, bottom: y + h, cx: x + w / 2 };
}

// Dựng path SVG gấp khúc với góc bo tròn từ danh sách điểm.
function roundedOrthogonalPath(points: { x: number; y: number }[], radius: number): string {
  if (points.length < 2) return '';
  let d = `M ${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const lenIn = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const lenOut = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(radius, lenIn / 2, lenOut / 2);
    const inX = cur.x - ((cur.x - prev.x) / (lenIn || 1)) * r;
    const inY = cur.y - ((cur.y - prev.y) / (lenIn || 1)) * r;
    const outX = cur.x + ((next.x - cur.x) / (lenOut || 1)) * r;
    const outY = cur.y + ((next.y - cur.y) / (lenOut || 1)) * r;
    d += ` L ${inX},${inY} Q ${cur.x},${cur.y} ${outX},${outY}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x},${last.y}`;
  return d;
}

// Điểm ở giữa (theo độ dài cung) của đường gấp khúc — để đặt nhãn/nút xoá.
function midpointOf(points: { x: number; y: number }[]): { x: number; y: number } {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  let half = total / 2;
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (half <= seg) {
      const r = seg === 0 ? 0 : half / seg;
      return {
        x: points[i - 1].x + (points[i].x - points[i - 1].x) * r,
        y: points[i - 1].y + (points[i].y - points[i - 1].y) * r,
      };
    }
    half -= seg;
  }
  return points[Math.floor(points.length / 2)];
}

// Tính đường "lách" cho dây nối vòng lên trên. Trả null nếu không phải trường hợp
// loop-back (khi đó dùng smooth-step mặc định).
function computeLoopBackPath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  sourcePosition: Position,
  targetPosition: Position,
  sBox: Box | null,
  tBox: Box | null,
): { path: string; labelX: number; labelY: number } | null {
  // Chỉ xử lý cấu hình handle chuẩn: nguồn ở ĐÁY (đi xuống), đích ở ĐỈNH (đi vào từ trên).
  if (sourcePosition !== Position.Bottom || targetPosition !== Position.Top) return null;
  if (!sBox || !tBox) return null;
  // Loop-back = đích nằm cao hơn nguồn (dây phải đi ngược lên trên). Chừa ngưỡng nhỏ để
  // luồng đi xuống bình thường (nguồn trên, đích dưới) vẫn dùng smooth-step.
  if (ty >= sy - LOOP_GAP * 2) return null;

  // Quyết định bên vòng theo vị trí handle nguồn so với tâm node nguồn:
  // handle nằm nửa TRÁI -> vòng sang trái; nửa PHẢI -> vòng sang phải.
  const goLeft = sx <= sBox.cx;
  const laneX = goLeft
    ? Math.min(sBox.left, tBox.left, sx, tx) - LOOP_LANE
    : Math.max(sBox.right, tBox.right, sx, tx) + LOOP_LANE;

  // Đi xuống dưới đáy node nguồn, rẽ ra làn, đi ngược lên trên đỉnh node đích, rẽ vào.
  const dropY = Math.max(sy, sBox.bottom) + LOOP_GAP;
  const riseY = Math.min(ty, tBox.top) - LOOP_GAP;

  const points = [
    { x: sx, y: sy },
    { x: sx, y: dropY },
    { x: laneX, y: dropY },
    { x: laneX, y: riseY },
    { x: tx, y: riseY },
    { x: tx, y: ty },
  ];

  const mid = midpointOf(points);
  return { path: roundedOrthogonalPath(points, LOOP_RADIUS), labelX: mid.x, labelY: mid.y };
}

export function DeletableEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  data,
  markerEnd,
  style,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const removeEdge = useFlowStore((s) => s.removeEdge);
  const t = useT();
  const hasLabel = typeof label === 'string' && label.length > 0;
  // Node condition/script: nhãn giá trị nhánh luôn hiện; các node khác chỉ hiện khi hover.
  const alwaysLabel = (data as RFEdgeData | undefined)?.alwaysLabel === true;
  const labelVisible = alwaysLabel || hovered;

  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  let edgePath: string;
  let labelX: number;
  let labelY: number;

  const loop = computeLoopBackPath(
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    boxOf(sourceNode),
    boxOf(targetNode),
  );
  if (loop) {
    edgePath = loop.path;
    labelX = loop.labelX;
    labelY = loop.labelY;
  } else {
    [edgePath, labelX, labelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      borderRadius: LOOP_RADIUS, // bo tròn tại các điểm gấp khúc
    });
  }

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
      {/* Nhãn điều kiện căn GIỮA dây; nút xoá tách hẳn sang phải (position absolute) nên
          không đè lên nhãn và không làm lệch tâm nhãn.
          - Node condition/script (nhánh tự do): nhãn GIÁ TRỊ luôn hiện.
          - Các node khác: nhãn chỉ hiện khi hover (dùng opacity nên vẫn giữ chỗ ->
            không lệch tâm, vùng bắt hover không đổi).
          Nút xoá luôn chỉ hiện khi hover. */}
      <EdgeLabelRenderer>
        <div
          className={`nodrag nopan edge-toolbar${hasLabel ? ' edge-toolbar--labeled' : ''}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {hasLabel && (
            <span className="edge-label" style={{ opacity: labelVisible ? 1 : 0 }}>
              {label}
            </span>
          )}
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
