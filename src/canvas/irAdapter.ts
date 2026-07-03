import type { Edge, Node } from '@xyflow/react';
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
  // Nhãn nhánh (FAILED/NEXT…) của node nhánh CỐ ĐỊNH: hiện khi hover, cạnh chấm output.
  sourceLabel?: string;
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
        // Gắn sourceHandles khi node có >1 output để BaseNode chia đều các chấm;
        // node 1 output dùng chấm mặc định (id 'default').
        ...(handles.length > 1 ? { sourceHandles: handles } : {}),
      } satisfies RFNodeData,
    };
  });

  const nodeById = new Map(ir.nodes.map((n) => [n.id, n]));
  const edges: Edge[] = ir.edges.map((e) => {
    const handles = handlesByNode.get(e.source) ?? [];
    // Nhãn của handle mà dây xuất phát (FAILED/NEXT hoặc giá trị nhánh).
    const matched = handles.find((h) => h.id === (e.sourceHandle ?? 'default'))?.label;
    const srcNode = nodeById.get(e.source);
    const isFixed = srcNode ? BRANCH_SCHEMA[srcNode.type].mode === 'fixed' : false;

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      type: 'deletable',
      // Node nhánh CỐ ĐỊNH: nhãn chỉ hiện khi hover (cạnh chấm output) -> để trống ở giữa;
      //   kể cả node chỉ có 1 nhánh NEXT (start/announce/transfer) cũng có nhãn.
      // Node nhánh TỰ DO: giữ nhãn giá trị nhánh hiển thị giữa dây như trước.
      label: isFixed
        ? undefined
        : (handles.length > 1 ? matched : undefined) ?? conditionOutputLabel(e.condition ?? e.label),
      data: {
        condition: e.condition,
        ...(isFixed && matched ? { sourceLabel: matched } : {}),
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
