import { create } from 'zustand';
import type { FlowIR, FlowEdge, FlowNode, NodeType } from '../ir/types';
import { fromYaml } from '../ir/fromYaml';
import { toYaml } from '../ir/toYaml';
import { layout } from '../ir/layout';
import { NODE_CONFIG } from '../ui/nodeConfig';
import { defaultDataFor, readBranches, BRANCH_SCHEMA, type DataBranch } from '../ui/nodeSchema';

// ─────────────────────────────────────────────────────────────────────────────
// Zustand store: giữ FlowIR (source of truth) + các action cập nhật IR.
// Canvas render TỪ IR (state -> view). Mọi thao tác người dùng gọi action ở đây,
// không giữ state flow riêng lẻ trong React Flow.
//
// Panel setting theo mô hình DRAFT: mọi chỉnh sửa ghi vào `draft` (bản nháp), chỉ
// khi bấm LƯU (commitDraft) mới ghi vào IR. Rời panel khi còn thay đổi -> `pendingSelect`
// giữ ý định điều hướng để panel hỏi xác nhận trước khi bỏ thay đổi.
// ─────────────────────────────────────────────────────────────────────────────

// Bản nháp đang sửa của node được chọn.
export interface NodeDraft {
  label: string;
  data: Record<string, unknown>;
}

interface FlowState {
  ir: FlowIR | null;
  selectedNodeId: string | null;
  draft: NodeDraft | null;
  // Ý định chuyển chọn (đổi node / đóng panel) đang chờ xác nhận vì draft còn dở.
  pendingSelect: { id: string | null } | null;

  // Đang kéo/di chuyển canvas (pan/zoom) -> ẩn thanh công cụ nổi trên node.
  isPanning: boolean;
  setPanning: (value: boolean) => void;

  // Nạp YAML -> IR -> auto-layout, rồi set vào store.
  loadYaml: (text: string) => Promise<void>;
  // Chạy lại ELK trên IR hiện tại.
  autoLayout: () => Promise<void>;
  // Xuất IR hiện tại ra chuỗi YAML (round-trip).
  exportYaml: () => string;

  // Cập nhật vị trí sau khi kéo-thả (commit vào IR).
  setNodePositions: (positions: Record<string, { x: number; y: number }>) => void;

  // Thêm 1 module (node) mới vào flow tại vị trí cho trước; trả về id vừa tạo.
  addNode: (type: NodeType, position: { x: number; y: number }) => string;
  // Xoá 1 module (node) + mọi dây nối tới/từ nó.
  removeNode: (id: string) => void;

  // Nối / xoá dây.
  addEdge: (edge: FlowEdge) => void;
  removeEdge: (id: string) => void;

  // Chọn node để mở panel setting (có kiểm tra thay đổi chưa lưu).
  selectNode: (id: string | null) => void;
  // Bỏ thay đổi & đóng panel ngay (nút HỦY — không hỏi lại).
  cancelEdit: () => void;
  // Xác nhận / huỷ điều hướng đang chờ (modal cảnh báo thay đổi chưa lưu).
  confirmPendingSelect: () => void;
  cancelPendingSelect: () => void;

  // Ghi bản nháp: label / 1 field data / nhánh tự do (condition/script).
  setDraftLabel: (label: string) => void;
  setDraftField: (key: string, value: unknown) => void;
  draftAddBranch: () => void;
  draftUpdateBranch: (branchId: string, value: string) => void;
  draftRemoveBranch: (branchId: string) => void;
  // Ghi bản nháp vào IR (nút LƯU) + dọn dây theo nhánh còn lại; đóng panel.
  commitDraft: () => void;
}

// Bản nháp có khác node đã commit không (label hoặc data)?
function isDirty(ir: FlowIR | null, selectedNodeId: string | null, draft: NodeDraft | null): boolean {
  if (!ir || !selectedNodeId || !draft) return false;
  const node = ir.nodes.find((n) => n.id === selectedNodeId);
  if (!node) return false;
  return node.label !== draft.label || JSON.stringify(node.data) !== JSON.stringify(draft.data);
}

// Tạo draft từ node (clone data để sửa không đụng IR).
function draftFromNode(node: FlowNode): NodeDraft {
  return { label: node.label, data: JSON.parse(JSON.stringify(node.data)) as Record<string, unknown> };
}

export const useFlowStore = create<FlowState>((set, get) => {
  // Áp dụng lựa chọn node ngay (khởi tạo draft). Không kiểm tra dirty ở đây.
  const applySelect = (id: string | null) => {
    const { ir } = get();
    const node = id != null ? ir?.nodes.find((n) => n.id === id) ?? null : null;
    set({
      selectedNodeId: node ? id : null,
      draft: node ? draftFromNode(node) : null,
      pendingSelect: null,
    });
  };

  return {
    ir: null,
    selectedNodeId: null,
    draft: null,
    pendingSelect: null,
    isPanning: false,
    setPanning: (value) => set({ isPanning: value }),

    loadYaml: async (text) => {
      const ir = fromYaml(text);
      const laidOut = await layout(ir);
      set({ ir: laidOut, selectedNodeId: null, draft: null, pendingSelect: null });
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
          nodes: ir.nodes.map((n) => (positions[n.id] ? { ...n, position: positions[n.id] } : n)),
        },
      });
    },

    addNode: (type, position) => {
      const { ir } = get();
      if (!ir) return '';
      // Start là điểm bắt đầu duy nhất — chỉ cho phép 1 node start trong flow.
      if (type === 'start' && ir.nodes.some((n) => n.type === 'start')) return '';
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
        // Tham số + nhánh mặc định theo loại node (xem nodeSchema.defaultDataFor).
        data: defaultDataFor(type),
      };
      set({
        ir: {
          ...ir,
          meta: { ...ir.meta, updatedAt: new Date().toISOString() },
          nodes: [...ir.nodes, node],
        },
        selectedNodeId: id,
        draft: draftFromNode(node),
        pendingSelect: null,
      });
      return id;
    },

    removeNode: (id) => {
      const { ir, selectedNodeId } = get();
      if (!ir) return;
      const closing = selectedNodeId === id;
      set({
        ir: {
          ...ir,
          meta: { ...ir.meta, updatedAt: new Date().toISOString() },
          nodes: ir.nodes.filter((n) => n.id !== id),
          // Xoá luôn các dây nối liên quan để không còn edge "treo".
          edges: ir.edges.filter((e) => e.source !== id && e.target !== id),
        },
        selectedNodeId: closing ? null : selectedNodeId,
        draft: closing ? null : get().draft,
        pendingSelect: closing ? null : get().pendingSelect,
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

    selectNode: (id) => {
      const { selectedNodeId, ir, draft } = get();
      if (id === selectedNodeId) return; // đã chọn -> không reset draft
      // Đang sửa dở node khác -> chặn, để panel hỏi xác nhận (modal).
      if (isDirty(ir, selectedNodeId, draft)) {
        set({ pendingSelect: { id } });
        return;
      }
      applySelect(id);
    },

    cancelEdit: () => applySelect(null),

    confirmPendingSelect: () => {
      const { pendingSelect } = get();
      applySelect(pendingSelect ? pendingSelect.id : null);
    },

    cancelPendingSelect: () => set({ pendingSelect: null }),

    setDraftLabel: (label) => {
      const { draft } = get();
      if (!draft) return;
      set({ draft: { ...draft, label } });
    },

    setDraftField: (key, value) => {
      const { draft } = get();
      if (!draft) return;
      set({ draft: { ...draft, data: { ...draft.data, [key]: value } } });
    },

    draftAddBranch: () => {
      const { draft } = get();
      if (!draft) return;
      const branches = readBranches(draft.data);
      const used = new Set(branches.map((b) => b.id));
      let i = branches.length;
      let id = `b${i}`;
      while (used.has(id)) id = `b${++i}`;
      const next: DataBranch[] = [...branches, { id, value: '' }];
      set({ draft: { ...draft, data: { ...draft.data, branches: next } } });
    },

    draftUpdateBranch: (branchId, value) => {
      const { draft } = get();
      if (!draft) return;
      const branches = readBranches(draft.data).map((b) => (b.id === branchId ? { ...b, value } : b));
      set({ draft: { ...draft, data: { ...draft.data, branches } } });
    },

    draftRemoveBranch: (branchId) => {
      const { draft } = get();
      if (!draft) return;
      // Không cho xoá nhánh đầu tiên (idx 0).
      const branches = readBranches(draft.data).filter((b, idx) => idx === 0 || b.id !== branchId);
      set({ draft: { ...draft, data: { ...draft.data, branches } } });
    },

    commitDraft: () => {
      const { ir, selectedNodeId, draft } = get();
      if (!ir || !selectedNodeId || !draft) return;
      const node = ir.nodes.find((n) => n.id === selectedNodeId);
      if (!node) return;

      const editable = BRANCH_SCHEMA[node.type].mode === 'editable';
      const branches = editable ? readBranches(draft.data) : [];
      const branchIds = new Set(branches.map((b) => b.id));
      const valueByHandle = new Map(branches.map((b) => [b.id, b.value]));

      set({
        ir: {
          ...ir,
          meta: { ...ir.meta, updatedAt: new Date().toISOString() },
          nodes: ir.nodes.map((n) =>
            n.id === selectedNodeId ? { ...n, label: draft.label, data: draft.data } : n,
          ),
          // Node nhánh tự do: bỏ dây xuất phát từ handle đã xoá; đồng bộ điều kiện dây còn lại.
          edges: editable
            ? ir.edges
                .filter(
                  (e) => e.source !== selectedNodeId || branchIds.has(e.sourceHandle ?? 'default'),
                )
                .map((e) => {
                  if (e.source !== selectedNodeId) return e;
                  const val = valueByHandle.get(e.sourceHandle ?? 'default') ?? '';
                  return { ...e, condition: val || undefined, label: val || undefined };
                })
            : ir.edges,
        },
        selectedNodeId: null,
        draft: null,
        pendingSelect: null,
      });
    },
  };
});
