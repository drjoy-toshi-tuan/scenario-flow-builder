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
// Đường dây được dựng thành DANH SÁCH ĐIỂM (points) cho cả 2 kiểu:
//   1. Dây đi XUỐNG bình thường (đích thấp hơn nguồn): V-H-V (dọc–ngang–dọc), đoạn
//      ngang ở giữa hai tầng.
//   2. Dây VÒNG LÊN TRÊN (retry/loop: đích cao hơn nguồn): thoát ra làn dọc bên
//      CẠNH của CHẤM output (trái/phải theo phía chấm) rồi vòng lên — KHÔNG cắt chéo
//      qua các nhánh anh em đi xuống ngay dưới node.
//
// WAYPOINT KÉO ĐƯỢC: mỗi dây có 1 điểm điều khiển (control) ở khúc gấp chính. Người
// dùng kéo control để NẮN dây (đoạn ngang lên/xuống, làn dọc trái/phải) nhằm tránh
// dây chồng chéo. Offset lưu ở node nguồn (data.edgeShapes[handle]) — round-trip YAML.
// Double-click control để trả dây về đường mặc định.
// ─────────────────────────────────────────────────────────────────────────────

// Khoảng đệm dây chừa ra khỏi mép node khi vòng.
const LOOP_LANE = 44; // làn dọc cách mép ngoài node (khi phải vòng RA NGOÀI)
const LOOP_GAP = 22; // đệm trên/dưới node trước khi rẽ ngang
const LOOP_RADIUS = 14; // bo góc gấp khúc (khớp smooth-step)
const LANE_MIN_GAP = 28; // khe ngang tối thiểu giữa 2 node để luồn dây VÀO GIỮA khe

interface Point {
  x: number;
  y: number;
}
interface Route {
  points: Point[];
  control: Point; // điểm điều khiển (waypoint) hiện tại — nơi vẽ tay nắm kéo
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
// Dùng để ghim nhãn điều kiện LÊN đúng dây khi kéo (không cho rời ra ngoài dây).
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

// Điểm ở giữa (theo độ dài cung) của đường gấp khúc — để đặt nhãn/nút xoá.
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
  shape: Point,
): Route | null {
  // Chỉ xử lý cấu hình handle chuẩn: nguồn ở ĐÁY (đi xuống), đích ở ĐỈNH (đi vào từ trên).
  if (sourcePosition !== Position.Bottom || targetPosition !== Position.Top) return null;
  if (!sBox || !tBox) return null;
  // Loop-back = đích nằm cao hơn nguồn (dây phải đi ngược lên trên).
  if (ty >= sy - LOOP_GAP * 2) return null;

  const dropY = Math.max(sy, sBox.bottom) + LOOP_GAP;
  const riseY = Math.min(ty, tBox.top) - LOOP_GAP;
  const laneTop = Math.min(riseY, dropY);
  const laneBottom = Math.max(riseY, dropY);

  // ── Chọn HƯỚNG vòng (trái/phải) ──────────────────────────────────────────
  const gapLeft = sBox.left - tBox.right;
  const gapRight = tBox.left - sBox.right;
  // Ưu tiên phía CHẤM OUTPUT (handle) khi node có NHIỀU nhánh: chấm lệch TRÁI -> vòng
  // trái, lệch PHẢI -> vòng phải. Nhờ vậy dây thoát ra ĐÚNG bên của nhánh nó rồi mới
  // vòng LÊN — KHÔNG cắt chéo qua các nhánh anh em đi xuống ngay dưới node.
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

  // ── Đặt LÀN DỌC ────────────────────────────────────────────────────────────
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

  // Waypoint: kéo làn dọc TRÁI/PHẢI (shape.x) + nâng/hạ 2 đoạn ngang (shape.y).
  const laneXAdj = laneX + shape.x;
  const dropYAdj = dropY + shape.y;
  const riseYAdj = riseY + shape.y;

  const points: Point[] = [
    { x: sx, y: sy },
    { x: sx, y: dropYAdj },
    { x: laneXAdj, y: dropYAdj },
    { x: laneXAdj, y: riseYAdj },
    { x: tx, y: riseYAdj },
    { x: tx, y: ty },
  ];
  return { points, control: { x: laneXAdj, y: (dropYAdj + riseYAdj) / 2 } };
}

// Đường đi XUỐNG bình thường (đích thấp hơn/ngang nguồn): V-H-V hoặc thẳng đứng.
function computeDown(sx: number, sy: number, tx: number, ty: number, shape: Point): Route {
  const straight = Math.abs(sx - tx) < 2;
  const baseBarY = (sy + ty) / 2;
  const baseBendX = straight ? sx : (sx + tx) / 2;
  const hasShape = shape.x !== 0 || shape.y !== 0;

  if (!hasShape) {
    const points = straight
      ? [
          { x: sx, y: sy },
          { x: tx, y: ty },
        ]
      : [
          { x: sx, y: sy },
          { x: sx, y: baseBarY },
          { x: tx, y: baseBarY },
          { x: tx, y: ty },
        ];
    return { points, control: { x: baseBendX, y: baseBarY } };
  }

  // Có waypoint: nắn dây qua điểm điều khiển C, vẫn VÀO đích theo phương DỌC.
  const cx = baseBendX + shape.x;
  const cy = baseBarY + shape.y;
  const nearTarget = Math.abs(cx - tx) < 2;
  let points: Point[];
  if (nearTarget) {
    // Làn dọc trùng cột đích -> V-H-V gọn tại độ cao cy.
    points = [
      { x: sx, y: sy },
      { x: sx, y: cy },
      { x: tx, y: cy },
      { x: tx, y: ty },
    ];
  } else {
    // Zig-zag qua C rồi hạ xuống trùng cột đích (đoạn cuối dọc -> mũi tên vào từ trên).
    const ty2 = cy + (ty - cy) * 0.55;
    points = [
      { x: sx, y: sy },
      { x: sx, y: cy },
      { x: cx, y: cy },
      { x: cx, y: ty2 },
      { x: tx, y: ty2 },
      { x: tx, y: ty },
    ];
  }
  return { points, control: { x: cx, y: cy } };
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
  // Node condition/script: nhãn giá trị nhánh luôn hiện; các node khác chỉ hiện khi hover.
  const alwaysLabel = edgeData?.alwaysLabel === true;
  // Đang chọn NHIỀU node (kéo khung / Shift-click): React Flow đánh dấu selected cho cả
  // các edge nằm trong khung -> nếu để selected bung nút xoá + nhãn thì cả canvas rối
  // nút thùng rác. Khi ở chế độ chọn nhóm, KHÔNG cho selected của edge kích hoạt toolbar.
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
  // Tay nắm waypoint chỉ hiện khi hover / chọn đơn (tránh rải chấm khắp canvas).
  const controlsVisible = hovered || selectionTriggersUi;

  const { screenToFlowPosition } = useReactFlow();
  const pathRef = useRef<SVGPathElement>(null);

  // ── Waypoint kéo được (nắn dây) ─────────────────────────────────────────────
  const savedShape = edgeData?.edgeShape ?? { x: 0, y: 0 };
  const shapeDragging = useRef(false);
  const shapeStart = useRef<{ shape: Point; flow: Point } | null>(null);
  const latestShape = useRef<Point | null>(null);
  const [shapePreview, setShapePreview] = useState<Point | null>(null);
  const shape = shapePreview ?? savedShape;

  // ── Stamp điều kiện kéo được (GHIM trên dây) ────────────────────────────────
  const stagger = edgeData?.labelStagger ?? { x: 0, y: 0 };
  const savedOffset = edgeData?.labelOffset ?? { x: 0, y: 0 };
  const labelDragging = useRef(false);
  const latestOffset = useRef<Point | null>(null);
  const [dragOffset, setDragOffset] = useState<Point | null>(null);
  const offsetX = dragOffset ? dragOffset.x : savedOffset.x;
  const offsetY = dragOffset ? dragOffset.y : savedOffset.y;

  const onLabelPointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (!alwaysLabel) return; // chỉ stamp luôn-hiện mới kéo được
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
      shape,
    ) ?? computeDown(sourceX, sourceY, targetX, targetY, shape);

  const edgePath = roundedOrthogonalPath(route.points, LOOP_RADIUS);
  const mid = midpointOf(route.points);
  const labelX = mid.x;
  const labelY = mid.y;
  const control = route.control;

  const onShapePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    shapeDragging.current = true;
    const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    shapeStart.current = { shape: { ...savedShape }, flow };
    latestShape.current = { ...savedShape };
    setShapePreview({ ...savedShape });
  };
  const onShapePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!shapeDragging.current || !shapeStart.current) return;
    const flow = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const next = {
      x: shapeStart.current.shape.x + (flow.x - shapeStart.current.flow.x),
      y: shapeStart.current.shape.y + (flow.y - shapeStart.current.flow.y),
    };
    latestShape.current = next;
    setShapePreview(next);
  };
  const onShapePointerUp = () => {
    if (!shapeDragging.current) return;
    shapeDragging.current = false;
    const next = latestShape.current;
    shapeStart.current = null;
    latestShape.current = null;
    setShapePreview(null);
    if (next) setEdgeShape(id, next);
  };
  // Double-click tay nắm -> trả dây về đường mặc định.
  const onShapeDoubleClick = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setShapePreview(null);
    setEdgeShape(id, null);
  };

  // ── Giữ nhãn LUÔN bám dây khi node di chuyển ────────────────────────────────
  const wantX = labelX + stagger.x + offsetX;
  const wantY = labelY + stagger.y + offsetY;
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

  const shapeCustomized = savedShape.x !== 0 || savedShape.y !== 0;

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
      <EdgeLabelRenderer>
        {/* Tay nắm waypoint: kéo để nắn dây (đoạn ngang lên/xuống, làn dọc trái/phải);
            double-click để trả về đường mặc định. Hiện khi hover/chọn, hoặc luôn hiện
            mờ khi dây đã được nắn tay (để biết có thể chỉnh/reset). */}
        <div
          className={`nodrag nopan edge-waypoint${shapePreview ? ' edge-waypoint--dragging' : ''}${
            shapeCustomized ? ' edge-waypoint--customized' : ''
          }`}
          style={{
            transform: `translate(-50%, -50%) translate(${control.x}px, ${control.y}px)`,
            opacity: controlsVisible || shapePreview ? 1 : shapeCustomized ? 0.35 : 0,
            pointerEvents: controlsVisible || shapeCustomized || shapePreview ? 'all' : 'none',
          }}
          title={t('edgeWaypointTitle')}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onPointerDown={onShapePointerDown}
          onPointerMove={onShapePointerMove}
          onPointerUp={onShapePointerUp}
          onDoubleClick={onShapeDoubleClick}
        />
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
