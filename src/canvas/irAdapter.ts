import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { FlowIR, FlowNode, NodeType } from '../ir/types';
import { sourceHandlesFor, BRANCH_SCHEMA } from '../ui/nodeSchema';

// ─────────────────────────────────────────────────────────────────────────────
// Adapter 2 chiều giữa IR và React Flow. 2 hàm thuần, KHÔNG chứa logic UI.
//   irToReactFlow(ir)                  -> { nodes, edges } để render
//   reactFlowToIr(nodes, edges, prev)  -> FlowIR (dựng lại IR từ trạng thái canvas)
// ─────────────────────────────────────────────────────────────────────────────

// Dữ liệu gắn vào mỗi React Flow node (để component node đọc).
export interface RFNodeData {
  label: string;
  nodeType: NodeType;
  nodeData: Record<string, unknown>;
  // Với node nhiều nhánh (condition): danh sách handle output ở đáy (mỗi nhánh 1 chấm).
  sourceHandles?: { id: string; label?: string }[];
  [key: string]: unknown; // React Flow yêu cầu data thoả Record<string, unknown>
}

// Dữ liệu gắn vào mỗi React Flow edge.
export interface RFEdgeData {
  condition?: string;
  // Node nguồn có nhánh TỰ DO (condition/script) -> nhãn giá trị luôn hiện;
  // các node khác nhãn chỉ hiện khi hover (xem DeletableEdge).
  alwaysLabel?: boolean;
  // Độ lệch nhãn do NGƯỜI DÙNG kéo stamp (lưu ở node nguồn data.labelOffsets[handle],
  // round-trip qua YAML) — cộng vào vị trí mặc định giữa dây.
  labelOffset?: { x: number; y: number };
  // Waypoint người dùng kéo để nắn dây (lưu ở node nguồn data.edgeShapes[handle]).
  edgeShape?: { x: number; y: number };
  [key: string]: unknown;
}

// CS: loại node nguồn có "stamp" điều kiện LUÔN hiển thị trên dây (không cần hover).
// Các loại khác ở màn CS bỏ hẳn nhãn — hover chỉ còn nút xoá dây.
const CS_CONDITION_SOURCE_TYPES: ReadonlySet<NodeType> = new Set([
  'logic',
  'transfer',
  'interaction',
]);

// Đọc độ lệch nhãn người dùng đã kéo (node.data.labelOffsets = { [handle]: {x,y} }).
function readLabelOffset(
  data: Record<string, unknown>,
  handle: string,
): { x: number; y: number } | undefined {
  const raw = data.labelOffsets;
  if (!raw || typeof raw !== 'object') return undefined;
  const v = (raw as Record<string, unknown>)[handle];
  if (!v || typeof v !== 'object') return undefined;
  const { x, y } = v as { x?: unknown; y?: unknown };
  return typeof x === 'number' && typeof y === 'number' ? { x, y } : undefined;
}

// Đọc waypoint người dùng đã kéo (node.data.edgeShapes = { [handle]: {x,y} }).
function readShapeOffset(
  data: Record<string, unknown>,
  handle: string,
): { x: number; y: number } | undefined {
  const raw = data.edgeShapes;
  if (!raw || typeof raw !== 'object') return undefined;
  const v = (raw as Record<string, unknown>)[handle];
  if (!v || typeof v !== 'object') return undefined;
  const { x, y } = v as { x?: unknown; y?: unknown };
  return typeof x === 'number' && typeof y === 'number' ? { x, y } : undefined;
}

// Nhãn hiển thị trên dây của node condition: CHỈ lấy giá trị output mà nhánh trả
// ra (vd "input == '1'" -> "1"), không hiện cả biểu thức điều kiện.
function conditionOutputLabel(raw?: string): string | undefined {
  if (!raw) return undefined;
  if (raw === 'default') return raw; // giữ nhánh mặc định
  // Lấy vế phải của phép so sánh: == '1' | === "a" | == 2  -> 1 | a | 2
  const cmp = raw.match(/===?\s*['"]?([^'"\s)]+)['"]?\s*$/);
  if (cmp) return cmp[1];
  // Hoặc bất kỳ literal trong nháy đầu tiên.
  const quoted = raw.match(/['"]([^'"]+)['"]/);
  if (quoted) return quoted[1];
  return raw;
}

// opts.cs: biến thể canvas màn CS (mũi tên đầu dây, nhãn nhánh luôn hiện khi node
// rẽ nhánh thật). Màn TS (mặc định) giữ hành vi cũ — hàm vẫn thuần, mode do caller truyền.
export function irToReactFlow(ir: FlowIR, opts?: { cs?: boolean }): { nodes: Node[]; edges: Edge[] } {
  const cs = opts?.cs === true;
  // Handle output ở đáy mỗi node suy ra từ schema/nhánh (không còn phụ thuộc edge)
  // -> thêm/bớt nhánh trong panel làm số chấm nối tăng/giảm ngay, kể cả khi chưa nối dây.
  const handlesByNode = new Map<string, { id: string; label?: string }[]>();
  for (const n of ir.nodes) {
    handlesByNode.set(n.id, sourceHandlesFor(n, cs));
  }

  const nodes: Node[] = ir.nodes.map((n) => {
    const handles = handlesByNode.get(n.id) ?? [];
    return {
      id: n.id,
      type: n.type, // khớp key trong nodeTypes map
      position: n.position,
      data: {
        label: n.label,
        nodeType: n.type,
        nodeData: n.data,
        // Gắn sourceHandles cho MỌI node có output (kể cả 1 nhánh) để BaseNode vừa
        // chia đều các chấm vừa biết nhãn nhánh -> hover chấm hiện label, kể cả khi
        // chưa nối dây. Node không có output (hangup) -> để trống.
        ...(handles.length > 0 ? { sourceHandles: handles } : {}),
      } satisfies RFNodeData,
    };
  });

  const nodeById = new Map(ir.nodes.map((n) => [n.id, n]));

  const edges: Edge[] = ir.edges.map((e) => {
    const handles = handlesByNode.get(e.source) ?? [];
    // Nhãn của handle mà dây xuất phát (FAILED/NEXT hoặc giá trị nhánh).
    const matched = handles.find((h) => h.id === (e.sourceHandle ?? 'default'))?.label;
    const srcNode = nodeById.get(e.source);
    const mode = srcNode ? BRANCH_SCHEMA[srcNode.type].mode : 'none';
    const isFixed = mode === 'fixed';

    // Nhãn nhánh căn GIỮA dây:
    //   - Node nhánh CỐ ĐỊNH (FAILED/NEXT…): nhãn = tên nhánh cố định (kể cả node 1 nhánh).
    //   - Node nhánh TỰ DO (condition/logic): nhãn = label nhánh (fallback giá trị nhánh).
    const baseLabel =
      (isFixed || mode === 'editable' || handles.length > 1 ? matched : undefined) ??
      conditionOutputLabel(e.condition ?? e.label);
    // CS: CHỈ node logic / transfer / hearing có stamp điều kiện (luôn hiện);
    // các loại khác bỏ hẳn nhãn — hover chỉ còn nút xoá dây. TS giữ hành vi cũ.
    const csCondition = cs && srcNode != null && CS_CONDITION_SOURCE_TYPES.has(srcNode.type);
    // Hearing (聴取) CHỈ có 2 nhánh (失敗 + 1 đường đi tiếp): đường "đi tiếp" là hiển
    // nhiên nên BỎ nhãn (次へ) cho canvas thoáng — chỉ giữ nhãn 失敗. Từ 3 nhánh trở
    // lên (聴取 rẽ nhánh thật) mới hiện nhãn cho mọi nhánh. (Theo yêu cầu CS 2026-07.)
    const hearingContinueUnlabeled =
      cs &&
      srcNode?.type === 'interaction' &&
      handles.length <= 2 &&
      (e.sourceHandle ?? 'default') !== 'failed';
    const showCsLabel = csCondition && !hearingContinueUnlabeled;
    const label = cs ? (showCsLabel ? baseLabel : undefined) : baseLabel;

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      type: 'deletable',
      label,
      // CS: mũi tên ở đầu đích — "tiếp điểm" của dây tại node đích là mũi tên (chấm
      // target đã ẩn). Màu đồng bộ token qua CSS .react-flow__arrowhead (index.css).
      // TS: KHÔNG mũi tên — tiếp điểm là chấm tròn "khoét lỗ" ở đỉnh node đích, giống
      // hệt tiếp điểm xuất phát (xem BaseNode: notch/mask target + CSS handle top).
      ...(cs ? { markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 } } : {}),
      data: {
        condition: e.condition,
        // TS: node condition/script nhãn giá trị nhánh luôn hiện; node khác hover mới hiện.
        // CS: stamp điều kiện của logic/transfer/hearing LUÔN hiện (không cần hover).
        alwaysLabel: cs ? showCsLabel && label != null : mode === 'editable',
        // Độ lệch stamp người dùng đã kéo (nếu có) — lưu ở node nguồn.
        ...(srcNode && label != null
          ? { labelOffset: readLabelOffset(srcNode.data, e.sourceHandle ?? 'default') }
          : {}),
        // Waypoint người dùng đã kéo để nắn dây (nếu có) — lưu ở node nguồn.
        ...(srcNode ? { edgeShape: readShapeOffset(srcNode.data, e.sourceHandle ?? 'default') } : {}),
      } satisfies RFEdgeData,
    };
  });

  // Nhãn điều kiện được neo SÁT chấm output nguồn (xem DeletableEdge.labelAnchor):
  // mỗi stamp ở 1 output riêng nên không còn chồng nhau quanh điểm hội tụ -> bỏ hẳn
  // bước "stagger so le" trước đây (từng cần khi nhãn đặt ở giữa dây).

  return { nodes, edges };
}

// Loại node có nhánh tự do (condition/script) — dùng ở nơi cần biết edge mang condition.
export function isEditableBranchNode(type: NodeType): boolean {
  return BRANCH_SCHEMA[type].mode === 'editable';
}

export function reactFlowToIr(nodes: Node[], edges: Edge[], prev: FlowIR): FlowIR {
  const prevById = new Map(prev.nodes.map((n) => [n.id, n]));

  const irNodes: FlowNode[] = nodes.map((rf) => {
    const base = prevById.get(rf.id);
    const data = rf.data as Partial<RFNodeData> | undefined;
    return {
      id: rf.id,
      type: (base?.type ?? data?.nodeType ?? 'announce') as NodeType,
      label: data?.label ?? base?.label ?? rf.id,
      position: rf.position,
      data: data?.nodeData ?? base?.data ?? {},
    };
  });

  const irEdges = edges.map((e) => {
    const data = e.data as RFEdgeData | undefined;
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      condition: data?.condition,
      label: typeof e.label === 'string' ? e.label : undefined,
    };
  });

  return {
    ...prev,
    nodes: irNodes,
    edges: irEdges,
    meta: { ...prev.meta, updatedAt: new Date().toISOString() },
  };
}
