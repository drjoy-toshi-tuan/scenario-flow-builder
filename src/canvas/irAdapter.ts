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
  [key: string]: unknown;
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

export function irToReactFlow(ir: FlowIR): { nodes: Node[]; edges: Edge[] } {
  // Handle output ở đáy mỗi node suy ra từ schema/nhánh (không còn phụ thuộc edge)
  // -> thêm/bớt nhánh trong panel làm số chấm nối tăng/giảm ngay, kể cả khi chưa nối dây.
  const handlesByNode = new Map<string, { id: string; label?: string }[]>();
  for (const n of ir.nodes) {
    handlesByNode.set(n.id, sourceHandlesFor(n));
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
  // Số dây ĐI RA thực tế của mỗi node — node >1 dây ra là "đang rẽ nhánh thật",
  // nhãn nhánh trên các dây đó luôn hiện (không tính theo handle: interaction luôn
  // có 2 handle FAILED/NEXT nhưng thường chỉ nối 1 dây -> đừng rải "次へ" khắp canvas).
  const outCount = new Map<string, number>();
  for (const e of ir.edges) outCount.set(e.source, (outCount.get(e.source) ?? 0) + 1);

  const edges: Edge[] = ir.edges.map((e) => {
    const handles = handlesByNode.get(e.source) ?? [];
    // Nhãn của handle mà dây xuất phát (FAILED/NEXT hoặc giá trị nhánh).
    const matched = handles.find((h) => h.id === (e.sourceHandle ?? 'default'))?.label;
    const srcNode = nodeById.get(e.source);
    const mode = srcNode ? BRANCH_SCHEMA[srcNode.type].mode : 'none';
    const isFixed = mode === 'fixed';

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      type: 'deletable',
      // Nhãn nhánh căn GIỮA dây, hành vi giống nhau cho MỌI loại node:
      //   - Node nhánh CỐ ĐỊNH (FAILED/NEXT…): nhãn = tên nhánh cố định (kể cả node 1 nhánh).
      //   - Node nhánh TỰ DO (condition/logic): nhãn = label nhánh (fallback giá trị nhánh).
      // Nút xoá hiện khi hover; nhãn + nút đều bám tâm dây (xem DeletableEdge).
      label:
        (isFixed || mode === 'editable' || handles.length > 1 ? matched : undefined) ??
        conditionOutputLabel(e.condition ?? e.label),
      // Mũi tên ở đầu đích cho MỌI dây — thấy ngay chiều đi của nhánh. Màu đồng bộ
      // token qua CSS .react-flow__arrowhead (index.css).
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      data: {
        condition: e.condition,
        // Nhãn nhánh LUÔN hiện khi node nguồn thật sự rẽ nhánh: nhánh tự do
        // (nexus/logic/jump) hoặc có >1 dây ra (vd NEXT + FAILED đều nối). Node chỉ
        // nối 1 đường ra giữ hover-only để canvas không đầy chữ "次へ" thừa.
        alwaysLabel: mode === 'editable' || (outCount.get(e.source) ?? 0) > 1,
      } satisfies RFEdgeData,
    };
  });

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
