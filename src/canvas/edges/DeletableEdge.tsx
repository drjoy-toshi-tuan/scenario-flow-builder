import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
  getSmoothStepPath,
  useInternalNode,
  useReactFlow,
  useStore,
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
// đường gấp khúc để tránh cắt qua node. Cách chọn làn dọc (không cứng nhắc):
//   1. Hướng vòng theo VỊ TRÍ node ĐÍCH so với node nguồn (đích bên trái -> vòng trái,
//      bên phải -> vòng phải), KHÔNG theo vị trí handle. Nhờ vậy dây không lao ra sai
//      bên rồi phải cuốn ngược lại.
//   2. Nếu 2 node đứng cạnh nhau và giữa chúng còn KHE đủ rộng (không bị node khác chắn)
//      thì luồn làn dọc vào GIỮA KHE — dây bám sát, gọn. Khe càng hẹp thì làn càng sát
//      vào giữa (tự co theo khoảng cách 2 node).
//   3. Chỉ khi khe quá hẹp / 2 node chồng ngang (vd đích nằm NGAY TRÊN nguồn) hoặc có
//      node khác chắn khe thì mới vòng hẳn RA NGOÀI mép node đích.
// ─────────────────────────────────────────────────────────────────────────────

// Khoảng đệm dây chừa ra khỏi mép node khi vòng.
const LOOP_LANE = 44; // làn dọc cách mép ngoài node (khi phải vòng RA NGOÀI)
const LOOP_GAP = 22; // đệm trên/dưới node trước khi rẽ ngang
const LOOP_RADIUS = 14; // bo góc gấp khúc (khớp smooth-step)
const LANE_MIN_GAP = 28; // khe ngang tối thiểu giữa 2 node để luồn dây VÀO GIỮA khe

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

// Điểm GẦN NHẤT trên path SVG so với 1 điểm (toạ độ flow) — lấy mẫu theo độ dài cung.
// Dùng để ghim nhãn điều kiện LÊN đúng dây khi kéo (không cho rời ra ngoài dây).
function nearestPointOnPath(path: SVGPathElement, pt: { x: number; y: number }): { x: number; y: number } {
  const total = path.getTotalLength();
  if (!total) return pt;
  let best = { x: pt.x, y: pt.y };
  let bestDist = Infinity;
  const steps = 160;
  for (let i = 0; i <= steps; i++) {
    const p = path.getPointAtLength((total * i) / steps);
    const dx = p.x - pt.x;
    const dy = p.y - pt.y;
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = { x: p.x, y: p.y };
    }
  }
  return best;
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

// Có node (chướng ngại) nào chắn làn dọc tại x = laneX trong dải [top, bottom] không?
function laneBlocked(laneX: number, top: number, bottom: number, obstacles: Box[]): boolean {
  for (const b of obstacles) {
    if (laneX > b.left && laneX < b.right && bottom > b.top && top < b.bottom) return true;
  }
  return false;
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
  obstacles: Box[],
): { path: string; labelX: number; labelY: number } | null {
  // Chỉ xử lý cấu hình handle chuẩn: nguồn ở ĐÁY (đi xuống), đích ở ĐỈNH (đi vào từ trên).
  if (sourcePosition !== Position.Bottom || targetPosition !== Position.Top) return null;
  if (!sBox || !tBox) return null;
  // Loop-back = đích nằm cao hơn nguồn (dây phải đi ngược lên trên). Chừa ngưỡng nhỏ để
  // luồng đi xuống bình thường (nguồn trên, đích dưới) vẫn dùng smooth-step.
  if (ty >= sy - LOOP_GAP * 2) return null;

  // Đi xuống dưới đáy node nguồn, rẽ ra làn, đi ngược lên trên đỉnh node đích, rẽ vào.
  const dropY = Math.max(sy, sBox.bottom) + LOOP_GAP;
  const riseY = Math.min(ty, tBox.top) - LOOP_GAP;
  const laneTop = Math.min(riseY, dropY);
  const laneBottom = Math.max(riseY, dropY);

  // ── Chọn HƯỚNG vòng (trái/phải) ──────────────────────────────────────────
  // Khe hở ngang: đích nằm HẲN bên trái nếu gapLeft > 0, hẳn bên phải nếu gapRight > 0.
  const gapLeft = sBox.left - tBox.right;
  const gapRight = tBox.left - sBox.right;
  let goLeft: boolean;
  if (gapLeft >= LANE_MIN_GAP) {
    goLeft = true; // đích rõ ràng nằm bên trái -> vòng trái
  } else if (gapRight >= LANE_MIN_GAP) {
    goLeft = false; // đích rõ ràng nằm bên phải -> vòng phải
  } else {
    // Đích ~ NGAY TRÊN nguồn (2 node chồng ngang): quyết định theo phía CHẤM OUTPUT.
    // Node nhiều output: chấm lệch TRÁI -> vòng trái, lệch PHẢI -> vòng phải (mỗi dây bám
    // đúng bên chấm của nó, không chéo qua thân node). Chấm ở giữa (1 output) -> theo tâm đích.
    const handleOffset = sx - sBox.cx;
    goLeft = Math.abs(handleOffset) > 1 ? handleOffset < 0 : tBox.cx <= sBox.cx;
  }

  // ── Đặt LÀN DỌC ────────────────────────────────────────────────────────────
  // Còn khe đủ rộng ở phía đã chọn & không bị node khác chắn -> luồn vào GIỮA khe (gọn,
  // tự co theo khoảng cách 2 node). Ngược lại (khe hẹp / chồng ngang / bị chắn) -> vòng
  // hẳn RA NGOÀI mép ngoài của cả 2 node, đúng phía đã chọn.
  const gap = goLeft ? gapLeft : gapRight;
  const gapLaneX = goLeft ? (tBox.right + sBox.left) / 2 : (sBox.right + tBox.left) / 2;
  let laneX: number;
  if (gap >= LANE_MIN_GAP && !laneBlocked(gapLaneX, laneTop, laneBottom, obstacles)) {
    laneX = gapLaneX;
  } else {
    laneX = goLeft
      ? Math.min(sBox.left, tBox.left) - LOOP_LANE
      : Math.max(sBox.right, tBox.right) + LOOP_LANE;
  }

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
  selected,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const removeEdge = useFlowStore((s) => s.removeEdge);
  const setEdgeLabelOffset = useFlowStore((s) => s.setEdgeLabelOffset);
  const t = useT();
  const hasLabel = typeof label === 'string' && label.length > 0;
  const edgeData = data as RFEdgeData | undefined;
  // Node condition/script: nhãn giá trị nhánh luôn hiện; các node khác chỉ hiện khi hover.
  const alwaysLabel = edgeData?.alwaysLabel === true;
  // Đang chọn NHIỀU node (kéo khung / Shift-click): React Flow đánh dấu selected cho cả
  // các edge nằm trong khung -> nếu để selected bung nút xoá + nhãn thì cả canvas rối
  // nút thùng rác. Khi ở chế độ chọn nhóm, KHÔNG cho selected của edge kích hoạt toolbar
  // (vẫn giữ nguyên khi bấm chọn ĐÚNG 1 dây, và luôn giữ hover). Đếm node selected > 1.
  const multiNodeSelection = useStore((s) => {
    let count = 0;
    for (const n of s.nodeLookup.values()) {
      if (n.selected && ++count > 1) return true;
    }
    return false;
  });
  const selectionTriggersUi = selected === true && !multiNodeSelection;
  // Nhãn hiện khi: luôn-hiện (stamp) · hover · hoặc dây đang được CHỌN đơn (bấm vào dây).
  const labelVisible = alwaysLabel || hovered || selectionTriggersUi;

  // ── Stamp điều kiện kéo được (GHIM trên dây) ────────────────────────────────
  // Vị trí nhãn = tâm dây + stagger chống chồng (irAdapter tính) + offset người dùng
  // đã kéo (lưu ở node nguồn). Khi kéo, con trỏ được CHIẾU về điểm gần nhất TRÊN dây
  // -> nhãn trượt DỌC theo dây, không rời ra chỗ khác. Kéo xong commit vào flowStore.
  const stagger = edgeData?.labelStagger ?? { x: 0, y: 0 };
  const savedOffset = edgeData?.labelOffset ?? { x: 0, y: 0 };
  const { screenToFlowPosition } = useReactFlow();
  const pathRef = useRef<SVGPathElement>(null);
  const dragging = useRef(false);
  const latestOffset = useRef<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const offsetX = dragOffset ? dragOffset.x : savedOffset.x;
  const offsetY = dragOffset ? dragOffset.y : savedOffset.y;

  const onLabelPointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    // Chỉ stamp luôn-hiện mới kéo được (nhãn hover-only giữ nguyên hành vi cũ).
    if (!alwaysLabel) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    latestOffset.current = { x: savedOffset.x, y: savedOffset.y };
    setDragOffset({ x: savedOffset.x, y: savedOffset.y });
  };
  const onLabelPointerMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (!dragging.current || !pathRef.current) return;
    // Con trỏ (toạ độ màn hình) -> toạ độ flow -> chiếu về điểm gần nhất trên dây.
    const flowPt = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const near = nearestPointOnPath(pathRef.current, flowPt);
    // Offset = điểm-trên-dây trừ vị trí gốc (tâm dây + stagger) để render đặt đúng chỗ.
    const off = { x: near.x - (labelX + stagger.x), y: near.y - (labelY + stagger.y) };
    latestOffset.current = off;
    setDragOffset(off);
  };
  const onLabelPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const off = latestOffset.current;
    latestOffset.current = null;
    setDragOffset(null);
    if (off) setEdgeLabelOffset(id, off);
  };

  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  // Các node khác (không phải nguồn/đích) — dùng để không luồn dây xuyên qua chúng.
  const nodeLookup = useStore((s) => s.nodeLookup);
  const obstacles = useMemo(() => {
    const list: Box[] = [];
    for (const [nid, n] of nodeLookup) {
      if (nid === source || nid === target) continue;
      const b = boxOf(n);
      if (b) list.push(b);
    }
    return list;
  }, [nodeLookup, source, target]);

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
    obstacles,
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

  // ── Giữ nhãn LUÔN bám dây khi node di chuyển ────────────────────────────────
  // Vị trí MONG MUỐN của nhãn = tâm dây + stagger + offset người dùng đã kéo. Khi
  // node di chuyển, đường dây (edgePath) đổi -> offset (vector tuyệt đối từ tâm dây)
  // trở nên cũ và có thể văng nhãn RA NGOÀI dây. Với nhãn ĐÃ ĐƯỢC KÉO (có offset),
  // ta chiếu điểm mong muốn về điểm gần nhất TRÊN dây rồi render ở đó -> nhãn không
  // bao giờ rời khỏi dây. Nhãn chưa kéo (chỉ có stagger chống chồng) giữ nguyên hành
  // vi cũ. Đang kéo thì dùng thẳng điểm kéo (vốn đã nằm trên dây).
  const wantX = labelX + stagger.x + offsetX;
  const wantY = labelY + stagger.y + offsetY;
  const hasUserOffset = savedOffset.x !== 0 || savedOffset.y !== 0;
  const [snapped, setSnapped] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    if (dragging.current || !pathRef.current || !hasUserOffset) {
      setSnapped(null);
      return;
    }
    setSnapped(nearestPointOnPath(pathRef.current, { x: wantX, y: wantY }));
  }, [edgePath, wantX, wantY, hasUserOffset]);
  const posX = !dragOffset && snapped ? snapped.x : wantX;
  const posY = !dragOffset && snapped ? snapped.y : wantY;

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {/* Path trong suốt, dày — vùng bắt hover rộng hơn để dễ trỏ vào dây. Cũng là
          path được LẤY MẪU để chiếu nhãn về đúng dây khi kéo (nearestPointOnPath). */}
      <path
        ref={pathRef}
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={22}
        style={{ cursor: 'pointer' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      {/* Nhãn điều kiện căn GIỮA dây (+ stagger chống chồng + offset người dùng kéo);
          nút xoá tách hẳn sang phải (position absolute) nên không đè lên nhãn và
          không làm lệch tâm nhãn.
          - Node có stamp luôn-hiện (alwaysLabel): nhãn LUÔN hiện và KÉO ĐƯỢC để tự sắp.
          - Các node khác: nhãn chỉ hiện khi hover (dùng opacity nên vẫn giữ chỗ ->
            không lệch tâm, vùng bắt hover không đổi).
          Nút xoá luôn chỉ hiện khi hover. */}
      <EdgeLabelRenderer>
        <div
          className={`nodrag nopan edge-toolbar${hasLabel ? ' edge-toolbar--labeled' : ''}`}
          style={{
            transform: `translate(-50%, -50%) translate(${posX}px, ${posY}px)`,
          }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          {hasLabel && (
            <span
              className={`edge-label${alwaysLabel ? ' edge-label--draggable' : ''}${dragOffset ? ' edge-label--dragging' : ''}`}
              style={{ opacity: labelVisible ? 1 : 0 }}
              onPointerDown={onLabelPointerDown}
              onPointerMove={onLabelPointerMove}
              onPointerUp={onLabelPointerUp}
            >
              {label}
            </span>
          )}
          <button
            type="button"
            title={t('deleteEdgeTitle')}
            aria-label={t('deleteEdgeTitle')}
            className="edge-trash"
            style={{ opacity: hovered || selectionTriggersUi ? 1 : 0 }}
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
