import { create } from 'zustand';
import type { FlowIR, FlowEdge, FlowNode, NodeType } from '../ir/types';
import { fromYaml } from '../ir/fromYaml';
import { toYaml } from '../ir/toYaml';
import { layout } from '../ir/layout';
import { NODE_CONFIG } from '../ui/nodeConfig';

// ─────────────────────────────────────────────────────────────────────────────
// Zustand store: giữ FlowIR (source of truth) + các action cập nhật IR.
// Canvas render TỪ IR (state -> view). Mọi thao tác người dùng gọi action ở đây,
// không giữ state flow riêng lẻ trong React Flow.
// ─────────────────────────────────────────────────────────────────────────────

interface FlowState {
  ir: FlowIR | null;
  selectedNodeId: string | null;

  // Nạp YAML -> IR -> auto-layout, rồi set vào store.
  loadYaml: (text: string) => Promise<void>;
  // Chạy lại ELK trên IR hiện tại.
  autoLayout: () => Promise<void>;
  // Xuất IR hiện tại ra chuỗi YAML (round-trip).
  exportYaml: () => string;

  // Cập nhật vị trí sau khi kéo-thả (commit vào IR).
  setNodePositions: (positions: Record<string, { x: number; y: number }>) => void;
  // Sửa label / data của 1 node (panel setting).
  updateNode: (id: string, patch: { label?: string; data?: Record<string, unknown> }) => void;

  // Thêm 1 module (node) mới vào flow tại vị trí cho trước; trả về id vừa tạo.
  addNode: (type: NodeType, position: { x: number; y: number }) => string;
  // Xoá 1 module (node) + mọi dây nối tới/từ nó.
  removeNode: (id: string) => void;

  // Nối / xoá dây.
  addEdge: (edge: FlowEdge) => void;
  removeEdge: (id: string) => void;

  // Chọn node để mở panel setting (double-click).
  selectNode: (id: string | null) => void;
}

export const useFlowStore = create<FlowState>((set, get) => ({
  ir: null,
  selectedNodeId: null,

  loadYaml: async (text) => {
    const ir = fromYaml(text);
    const laidOut = await layout(ir);
    set({ ir: laidOut, selectedNodeId: null });
  },

  autoLayout: async () => {
    const { ir } = get();
    if (!ir) return;
    const laidOut = await layout(ir);
    set({ ir: laidOut });
  },

  exportYaml: () => {
    const { ir } = get();
    return ir ? toYaml(ir) : '';
  },

  setNodePositions: (positions) => {
    const { ir } = get();
    if (!ir) return;
    set({
      ir: {
        ...ir,
        nodes: ir.nodes.map((n) =>
          positions[n.id] ? { ...n, position: positions[n.id] } : n,
        ),
      },
    });
  },

  updateNode: (id, patch) => {
    const { ir } = get();
    if (!ir) return;
    set({
      ir: {
        ...ir,
        meta: { ...ir.meta, updatedAt: new Date().toISOString() },
        nodes: ir.nodes.map((n) =>
          n.id === id
            ? {
                ...n,
                label: patch.label ?? n.label,
                data: patch.data ? { ...n.data, ...patch.data } : n.data,
              }
            : n,
        ),
      },
    });
  },

  addNode: (type, position) => {
    const { ir } = get();
    if (!ir) return '';
    // id duy nhất theo loại: announce_1, announce_2, …
    const existing = new Set(ir.nodes.map((n) => n.id));
    let i = 1;
    let id = `${type}_${i}`;
    while (existing.has(id)) id = `${type}_${++i}`;

    const node: FlowNode = {
      id,
      type,
      label: `${NODE_CONFIG[type].typeLabel} ${i}`,
      position,
      data: { description: '' }, // mô tả rỗng — người dùng nhập ở panel setting
    };
    set({
      ir: {
        ...ir,
        meta: { ...ir.meta, updatedAt: new Date().toISOString() },
        nodes: [...ir.nodes, node],
      },
      selectedNodeId: id,
    });
    return id;
  },

  removeNode: (id) => {
    const { ir, selectedNodeId } = get();
    if (!ir) return;
    set({
      ir: {
        ...ir,
        meta: { ...ir.meta, updatedAt: new Date().toISOString() },
        nodes: ir.nodes.filter((n) => n.id !== id),
        // Xoá luôn các dây nối liên quan để không còn edge "treo".
        edges: ir.edges.filter((e) => e.source !== id && e.target !== id),
      },
      selectedNodeId: selectedNodeId === id ? null : selectedNodeId,
    });
  },

  addEdge: (edge) => {
    const { ir } = get();
    if (!ir) return;
    // Tránh trùng: bỏ qua nếu đã có edge cùng source+target+handle.
    const exists = ir.edges.some(
      (e) =>
        e.source === edge.source &&
        e.target === edge.target &&
        (e.sourceHandle ?? '') === (edge.sourceHandle ?? ''),
    );
    if (exists) return;
    set({ ir: { ...ir, edges: [...ir.edges, edge] } });
  },

  removeEdge: (id) => {
    const { ir } = get();
    if (!ir) return;
    set({ ir: { ...ir, edges: ir.edges.filter((e) => e.id !== id) } });
  },

  selectNode: (id) => set({ selectedNodeId: id }),
}));
