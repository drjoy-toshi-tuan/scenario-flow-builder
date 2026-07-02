import type { Edge, Node } from '@xyflow/react';
import type { FlowIR, FlowNode, NodeType } from '../ir/types';

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
  [key: string]: unknown;
}

export function irToReactFlow(ir: FlowIR): { nodes: Node[]; edges: Edge[] } {
  // Gom các nhánh output cho node 'condition' (mỗi edge đi ra = 1 handle ở đáy).
  const branchHandles = new Map<string, { id: string; label?: string }[]>();
  for (const n of ir.nodes) {
    if (n.type !== 'condition') continue;
    const outs = ir.edges.filter((e) => e.source === n.id);
    branchHandles.set(
      n.id,
      outs.map((e, i) => ({
        id: e.sourceHandle ?? `b${i}`,
        label: e.label ?? e.condition,
      })),
    );
  }

  const nodes: Node[] = ir.nodes.map((n) => ({
    id: n.id,
    type: n.type, // khớp key trong nodeTypes map
    position: n.position,
    data: {
      label: n.label,
      nodeType: n.type,
      nodeData: n.data,
      ...(branchHandles.has(n.id) ? { sourceHandles: branchHandles.get(n.id) } : {}),
    } satisfies RFNodeData,
  }));

  const conditionIds = new Set(branchHandles.keys());
  const edges: Edge[] = ir.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    // Chỉ node 'condition' có nhiều handle nên mới cần gắn sourceHandle để dây
    // xuất phát đúng chấm; node thường dùng 1 handle mặc định (bỏ sourceHandle).
    sourceHandle: conditionIds.has(e.source) ? e.sourceHandle : undefined,
    type: 'deletable',
    label: e.label ?? e.condition,
    data: { condition: e.condition } satisfies RFEdgeData,
  }));

  return { nodes, edges };
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
