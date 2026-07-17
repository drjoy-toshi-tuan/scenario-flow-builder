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
  // Độ lệch CHỐNG CHỒNG nhãn tự tính khi nhiều dây (từ nhiều node) cùng chập về
  // 1 đích — xếp so le dọc để các stamp điều kiện không đè lên nhau.
  labelStagger?: { x: number; y: number };
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
    const label = cs ? (csCondition ? baseLabel : undefined) : baseLabel;

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      type: 'deletable',
      label,
      // Mũi tên ở đầu đích cho MỌI dây (cả CS lẫn TS) — thấy ngay chiều đi của nhánh,
      // đồng thời là "tiếp điểm" của dây tại node đích (chấm target đã ẩn). Màu đồng bộ
      // token qua CSS .react-flow__arrowhead (index.css).
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      data: {
        condition: e.condition,
        // TS: node condition/script nhãn giá trị nhánh luôn hiện; node khác hover mới hiện.
        // CS: stamp điều kiện của logic/transfer/hearing LUÔN hiện (không cần hover).
        alwaysLabel: cs ? csCondition && label != null : mode === 'editable',
        // Độ lệch stamp người dùng đã kéo (nếu có) — lưu ở node nguồn.
        ...(srcNode && label != null
          ? { labelOffset: readLabelOffset(srcNode.data, e.sourceHandle ?? 'default') }
          : {}),
      } satisfies RFEdgeData,
    };
  });

  // CS: nhiều dây (từ nhiều node) chập về CÙNG 1 đích -> các stamp luôn-hiện dễ đè
  // lên nhau quanh điểm hội tụ. Xếp so le dọc quanh tâm (bước 22px) làm vị trí MẶC
  // ĐỊNH; người dùng vẫn kéo từng stamp để tự sắp (labelOffset cộng thêm).
  if (cs) {
    const byTarget = new Map<string, Edge[]>();
    for (const edge of edges) {
      const d = edge.data as RFEdgeData;
      if (d.alwaysLabel && edge.label != null) {
        const list = byTarget.get(edge.target) ?? [];
        list.push(edge);
        byTarget.set(edge.target, list);
      }
    }
    for (const list of byTarget.values()) {
      if (list.length < 2) continue;
      list.forEach((edge, i) => {
        (edge.data as RFEdgeData).labelStagger = {
          x: 0,
          y: i * 22 - ((list.length - 1) * 22) / 2,
        };
      });
    }
  }

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
