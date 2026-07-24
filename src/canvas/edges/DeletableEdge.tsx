import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  Position,
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
// Dây gấp khúc trực giao (orthogonal), góc bo tròn; nếu source & target thẳng hàng
// thì tự động là đường thẳng đứng.
//
// Đường dây dựng thành DANH SÁCH ĐIỂM (points) cho cả 2 kiểu:
//   1. Đi XUỐNG bình thường (đích thấp hơn nguồn): V-H-V (dọc–ngang–dọc), đoạn ngang
//      ở GIỮA hai tầng.
//   2. VÒNG LÊN TRÊN (retry/loop: đích cao hơn nguồn): thoát ra làn dọc ĐÚNG PHÍA của
//      chấm output rồi vòng lên — KHÔNG cắt chéo qua các nhánh anh em đi xuống.
//
// NẮN DÂY: chỉ đoạn NGANG Ở GIỮA (dây V-H-V đi xuống) kéo được LÊN/XUỐNG — click &
// giữ ngay trên đoạn ngang đó rồi kéo (con trỏ ns-resize). Độ lệch (chỉ trục Y) lưu ở
// node nguồn (data.edgeShapes[handle].y), round-trip YAML. Double-click đoạn ngang để
// trả dây về mặc định. Dây thẳng đứng / dây vòng lên KHÔNG có đoạn ngang giữa nên
// không kéo (giữ nguyên hình).
// ─────────────────────────────────────────────────────────────────────────────

// Khoảng đệm dây chừa ra khỏi mép node khi vòng.
const LOOP_LANE = 44; // làn dọc cách mép ngoài node (khi phải vòng RA NGOÀI)
const LOOP_GAP = 22; // đệm trên/dưới node trước khi rẽ ngang
const LOOP_RADIUS = 14; // bo góc gấp khúc (khớp smooth-step)
const LANE_MIN_GAP = 28; // khe ngang tối thiểu giữa 2 node để luồn dây VÀO GIỮA khe
const LABEL_DROP = 22; // nhãn điều kiện đặt cách chấm output nguồn ~22px (sát nhưng không dính)

interface Point {
  x: number;
  y: number;
}
// Đoạn ngang ở giữa (kéo được lên/xuống): y hiện tại + 2 mút x.
interface HMid {
  y: number;
  x1: number;
  x2: number;
}
interface Route {
  points: Point[];
  hMid: HMid | null; // đoạn ngang giữa kéo được (null nếu dây thẳng / dây vòng)
}

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

// Bỏ điểm trùng liên tiếp (tránh đoạn dài 0 làm hỏng bo góc).
function dedupe(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 0.5 || Math.abs(last.y - p.y) > 0.5) out.push(p);
  }
  return out.length >= 2 ? out : points;
}

// Dựng path SVG gấp khúc với góc bo tròn từ danh sách điểm.
function roundedOrthogonalPath(rawPoints: Point[], radius: number): string {
  const points = dedupe(rawPoints);
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
function nearestPointOnPath(path: SVGPathElement, pt: Point): Point {
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

// Neo NHÃN điều kiện: đặt trên đoạn ĐẦU TIÊN (từ chấm output nguồn đi ra), cách
// nguồn LABEL_DROP px. Ưu điểm so với đặt ở giữa dây:
//   - Bám node NGUỒN -> không "xô dịch" khi di chuyển node đích / nhiều node.
//   - Sát chấm output (trực quan cho biết nhánh nào), nằm ở đoạn CHỈ có dây này
//     (trước điểm hội tụ) nên không đè nhãn/dây khác.
//   - Ở khe ngay dưới node nguồn -> không rơi trúng node khác sau auto-layout.
function labelAnchor(points: Point[]): Point {
  const a = points[0];
  const b = points[1] ?? points[0];
  const segLen = Math.hypot(b.x - a.x, b.y - a.y);
  if (segLen < 1) return a;
  const d = Math.min(LABEL_DROP, segLen / 2);
  return { x: a.x + ((b.x - a.x) / segLen) * d, y: a.y + ((b.y - a.y) / segLen) * d };
}

// Điểm ở giữa (theo độ dài cung) của đường gấp khúc — để đặt nút xoá (dây không nhãn).
function midpointOf(points: Point[]): Point {
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

// Đường "lách" cho dây nối VÒNG LÊN TRÊN. Trả null nếu không phải loop-back.
function computeLoopBack(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  sourcePosition: Position,
  targetPosition: Position,
  sBox: Box | null,
  tBox: Box | null,
  obstacles: Box[],
): Route | null {
  if (sourcePosition !== Position.Bottom || targetPosition !== Position.Top) return null;
  if (!sBox || !tBox) return null;
  if (ty >= sy - LOOP_GAP * 2) return null;

  const dropY = Math.max(sy, sBox.bottom) + LOOP_GAP;
  const riseY = Math.min(ty, tBox.top) - LOOP_GAP;
  const laneTop = Math.min(riseY, dropY);
  const laneBottom = Math.max(riseY, dropY);

  const gapLeft = sBox.left - tBox.right;
  const gapRight = tBox.left - sBox.right;
  // Ưu tiên phía CHẤM OUTPUT (handle) khi node có NHIỀU nhánh: dây thoát ra ĐÚNG bên
  // của nhánh nó rồi mới vòng lên -> không cắt chéo nhánh anh em.
  const handleOffset = sx - sBox.cx;
  const handleSided = Math.abs(handleOffset) > 1;
  let goLeft: boolean;
  if (handleSided) {
    goLeft = handleOffset < 0;
  } else if (gapLeft >= LANE_MIN_GAP) {
    goLeft = true;
  } else if (gapRight >= LANE_MIN_GAP) {
    goLeft = false;
  } else {
    goLeft = tBox.cx <= sBox.cx;
  }

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

  const points: Point[] = [
    { x: sx, y: sy },
    { x: sx, y: dropY },
    { x: laneX, y: dropY },
    { x: laneX, y: riseY },
    { x: tx, y: riseY },
    { x: tx, y: ty },
  ];
  // Dây vòng lên KHÔNG có đoạn ngang "giữa" đơn nhất -> không cho kéo (giữ auto-route).
  return { points, hMid: null };
}

// Đường đi XUỐNG bình thường: V-H-V (đoạn ngang giữa kéo được lên/xuống) hoặc thẳng đứng.
// offsetY = độ lệch người dùng đã kéo cho đoạn ngang giữa.
function computeDown(sx: number, sy: number, tx: number, ty: number, offsetY: number): Route {
  const straight = Math.abs(sx - tx) < 2;
  const barY = (sy + ty) / 2 + offsetY;
  if (straight) {
    // Thẳng đứng: không có đoạn ngang giữa -> không kéo được.
    return {
      points: [
        { x: sx, y: sy },
        { x: tx, y: ty },
      ],
      hMid: null,
    };
  }
  return {
    points: [
      { x: sx, y: sy },
      { x: sx, y: barY },
      { x: tx, y: barY },
      { x: tx, y: ty },
    ],
    hMid: { y: barY, x1: sx, x2: tx },
  };
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
  const setEdgeShape = useFlowStore((s) => s.setEdgeShape);
  const t = useT();
  const hasLabel = typeof label === 'string' && label.length > 0;
  const edgeData = data as RFEdgeData | undefined;
  const alwaysLabel = edgeData?.alwaysLabel === true;
  const multiNodeSelection = useStore((s) => {
    let count = 0;
    for (const n of s.nodeLookup.values()) {
      if (n.selected && ++count > 1) return true;
    }
    return false;
  });
  const selectionTriggersUi = selected === true && !multiNodeSelection;
  const labelVisible = alwaysLabel || hovered || selectionTriggersUi;

  const { screenToFlowPosition } = useReactFlow();
  const pathRef = useRef<SVGPathElement>(null);

  // ── Nắn dây: kéo đoạn NGANG GIỮA lên/xuống (chỉ trục Y) ─────────────────────
  const savedShapeY = edgeData?.edgeShape?.y ?? 0;
  const midDragging = useRef(false);
  const midStart = useRef<{ y: number; flowY: number } | null>(null);
  const latestY = useRef<number | null>(null);
  const [midPreview, setMidPreview] = useState<number | null>(null);
  const offsetY = midPreview ?? savedShapeY;

  // ── Stamp điều kiện kéo được (GHIM trên dây) ────────────────────────────────
  // Neo nhãn theo chấm output nguồn đã tách sẵn từng stamp (mỗi nhãn ở 1 output
  // riêng) nên KHÔNG cần stagger chống chồng theo điểm hội tụ nữa.
  const stagger = { x: 0, y: 0 };
  const savedOffset = edgeData?.labelOffset ?? { x: 0, y: 0 };
  const labelDragging = useRef(false);
  const latestOffset = useRef<Point | null>(null);
  const [dragOffset, setDragOffset] = useState<Point | null>(null);
  const labelOffX = dragOffset ? dragOffset.x : savedOffset.x;
  const labelOffY = dragOffset ? dragOffset.y : savedOffset.y;

  const onLabelPointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (!alwaysLabel) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    labelDragging.current = true;
    latestOffset.current = { x: savedOffset.x, y: savedOffset.y };
    setDragOffset({ x: savedOffset.x, y: savedOffset.y });
  };
  const onLabelPointerMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (!labelDragging.current || !pathRef.current) return;
    const flowPt = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const near = nearestPointOnPath(pathRef.current, flowPt);
    const off = { x: near.x - (labelX + stagger.x), y: near.y - (labelY + stagger.y) };
    latestOffset.current = off;
    setDragOffset(off);
  };
  const onLabelPointerUp = () => {
    if (!labelDragging.current) return;
    labelDragging.current = false;
    const off = latestOffset.current;
    latestOffset.current = null;
    setDragOffset(null);
    if (off) setEdgeLabelOffset(id, off);
  };

  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
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

  const route =
    computeLoopBack(
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      boxOf(sourceNode),
      boxOf(targetNode),
      obstacles,
    ) ?? computeDown(sourceX, sourceY, targetX, targetY, offsetY);

  const edgePath = roundedOrthogonalPath(route.points, LOOP_RADIUS);
  // Dây CÓ nhãn (stamp điều kiện) -> neo sát chấm output nguồn (ổn định, không đè
  // node/điểm hội tụ). Dây KHÔNG nhãn -> nút xoá đặt giữa dây cho dễ trỏ.
  const anchor = hasLabel ? labelAnchor(route.points) : midpointOf(route.points);
  const labelX = anchor.x;
  const labelY = anchor.y;
  const hMid = route.hMid;

  const onMidPointerDown = (e: ReactPointerEvent<SVGLineElement>) => {
    e.stopPropagation();
    e.preventDefault();
    (e.target as SVGLineElement).setPointerCapture(e.pointerId);
    midDragging.current = true;
    const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    midStart.current = { y: savedShapeY, flowY: flow.y };
    latestY.current = savedShapeY;
    setMidPreview(savedShapeY);
  };
  const onMidPointerMove = (e: ReactPointerEvent<SVGLineElement>) => {
    if (!midDragging.current || !midStart.current) return;
    const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const ny = midStart.current.y + (flow.y - midStart.current.flowY);
    latestY.current = ny;
    setMidPreview(ny);
  };
  const onMidPointerUp = () => {
    if (!midDragging.current) return;
    midDragging.current = false;
    const ny = latestY.current;
    midStart.current = null;
    latestY.current = null;
    setMidPreview(null);
    if (ny != null) setEdgeShape(id, { x: 0, y: Math.round(ny) });
  };
  const onMidDoubleClick = (e: ReactPointerEvent<SVGLineElement>) => {
    e.stopPropagation();
    setMidPreview(null);
    setEdgeShape(id, null);
  };

  // ── Giữ nhãn LUÔN bám dây khi node di chuyển ────────────────────────────────
  const wantX = labelX + stagger.x + labelOffX;
  const wantY = labelY + stagger.y + labelOffY;
  const hasUserOffset = savedOffset.x !== 0 || savedOffset.y !== 0;
  const [snapped, setSnapped] = useState<Point | null>(null);
  useLayoutEffect(() => {
    if (labelDragging.current || !pathRef.current || !hasUserOffset) {
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
      {/* Đoạn NGANG GIỮA kéo được lên/xuống: dải trong suốt phủ đúng đoạn ngang, nằm
          TRÊN path hover nên nhận được kéo. Con trỏ ns-resize báo hiệu kéo dọc. */}
      {hMid && (
        <line
          x1={hMid.x1}
          y1={hMid.y}
          x2={hMid.x2}
          y2={hMid.y}
          stroke="transparent"
          strokeWidth={16}
          style={{ cursor: 'ns-resize' }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onPointerDown={onMidPointerDown}
          onPointerMove={onMidPointerMove}
          onPointerUp={onMidPointerUp}
          onDoubleClick={onMidDoubleClick}
        >
          <title>{t('edgeWaypointTitle')}</title>
        </line>
      )}
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
