import { create } from 'zustand';
import type { FlowIR, FlowEdge, FlowNode, NodeType } from '../ir/types';
import { fromYaml } from '../ir/fromYaml';
import { toYaml } from '../ir/toYaml';
import { layout } from '../ir/layout';
import { NODE_CONFIG } from '../ui/nodeConfig';
import { defaultDataFor, readBranches, BRANCH_SCHEMA, CATCH_ALL_ID, type DataBranch } from '../ui/nodeSchema';
import { DEFAULT_IVR_SETTINGS, formatDateTime, type IvrSettings } from '../ir/ivrProperty';

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

  // Cấu hình IVR Property (施設名 / Office ID / môi trường / TTS / STT) — dùng cho
  // modal "Cài đặt IVR Property". Giữ độc lập với ir để không bị reset khi nạp lại YAML.
  ivr: IvrSettings;
  setIvr: (patch: Partial<IvrSettings>) => void;
  // Thời điểm import YAML (yyyy-MM-dd HH:mm) -> điền vào 作成日時 của IVR Property.
  ivrCreatedAt: string;

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

  // Xoá node có xác nhận: nút "Xoá" chỉ đặt pendingDelete -> modal hỏi lại;
  // confirm mới thực sự removeNode, cancel thì bỏ ý định.
  pendingDelete: string | null;
  requestDeleteNode: (id: string) => void;
  confirmDeleteNode: () => void;
  cancelDeleteNode: () => void;

  // Lịch sử Undo/Redo (snapshot IR). past = trạng thái trước, future = đã undo.
  past: FlowIR[];
  future: FlowIR[];
  undo: () => void;
  redo: () => void;

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
  draftSetBranchLabel: (branchId: string, label: string) => void;
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

// Số bước Undo tối đa giữ trong bộ nhớ.
const HISTORY_LIMIT = 50;

export const useFlowStore = create<FlowState>((set, get) => {
  // Chụp IR hiện tại vào `past` (xoá `future`) — gọi TRƯỚC mỗi thay đổi có thể undo.
  // Trả về mảnh state để trộn vào set({...}).
  const snapshot = (): Partial<FlowState> => {
    const { ir, past } = get();
    if (!ir) return {};
    return { past: [...past, ir].slice(-HISTORY_LIMIT), future: [] };
  };

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
    pendingDelete: null,
    past: [],
    future: [],
    isPanning: false,
    setPanning: (value) => set({ isPanning: value }),

    ivr: { ...DEFAULT_IVR_SETTINGS },
    setIvr: (patch) => set({ ivr: { ...get().ivr, ...patch } }),
    ivrCreatedAt: formatDateTime(new Date()),

    loadYaml: async (text) => {
      const ir = fromYaml(text);
      const laidOut = await layout(ir);
      // Seed 施設名 từ meta.facility nếu người dùng chưa nhập.
      const { ivr } = get();
      const nextIvr =
        !ivr.facilityName && laidOut.meta.facility
          ? { ...ivr, facilityName: laidOut.meta.facility }
          : ivr;
      set({
        ir: laidOut,
        selectedNodeId: null,
        draft: null,
        pendingSelect: null,
        pendingDelete: null,
        // Nạp file mới -> reset lịch sử Undo/Redo.
        past: [],
        future: [],
        ivr: nextIvr,
        // Mốc 作成日時 = thời điểm import file YAML này.
        ivrCreatedAt: formatDateTime(new Date()),
      });
    },

    autoLayout: async () => {
      const { ir } = get();
      if (!ir) return;
      const laidOut = await layout(ir);
      set({ ...snapshot(), ir: laidOut });
    },

    exportYaml: () => {
      const { ir } = get();
      return ir ? toYaml(ir) : '';
    },

    setNodePositions: (positions) => {
      const { ir } = get();
      if (!ir) return;
      set({
        ...snapshot(),
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
        ...snapshot(),
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
        ...snapshot(),
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
        pendingDelete: null,
      });
    },

    requestDeleteNode: (id) => set({ pendingDelete: id }),
    confirmDeleteNode: () => {
      const { pendingDelete, removeNode } = get();
      if (pendingDelete) removeNode(pendingDelete);
    },
    cancelDeleteNode: () => set({ pendingDelete: null }),

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
      set({ ...snapshot(), ir: { ...ir, edges: [...ir.edges, edge] } });
    },

    removeEdge: (id) => {
      const { ir } = get();
      if (!ir) return;
      set({ ...snapshot(), ir: { ...ir, edges: ir.edges.filter((e) => e.id !== id) } });
    },

    undo: () => {
      const { past, future, ir } = get();
      if (past.length === 0) return;
      const prev = past[past.length - 1];
      set({
        ir: prev,
        past: past.slice(0, -1),
        future: ir ? [ir, ...future].slice(0, HISTORY_LIMIT) : future,
        // Đóng panel/ý định đang mở để tránh tham chiếu node không còn tồn tại.
        selectedNodeId: null,
        draft: null,
        pendingSelect: null,
        pendingDelete: null,
      });
    },

    redo: () => {
      const { past, future, ir } = get();
      if (future.length === 0) return;
      const next = future[0];
      set({
        ir: next,
        future: future.slice(1),
        past: ir ? [...past, ir].slice(-HISTORY_LIMIT) : past,
        selectedNodeId: null,
        draft: null,
        pendingSelect: null,
        pendingDelete: null,
      });
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
      // id duy nhất b0, b1, … (không đụng nhánh catch-all 'default').
      const used = new Set(branches.map((b) => b.id));
      let i = 0;
      let id = `b${i}`;
      while (used.has(id)) id = `b${++i}`;
      const next: DataBranch[] = [...branches, { id, value: '' }];
      set({ draft: { ...draft, data: { ...draft.data, branches: next } } });
    },

    draftUpdateBranch: (branchId, value) => {
      const { draft } = get();
      if (!draft || branchId === CATCH_ALL_ID) return; // catch-all không sửa value
      const branches = readBranches(draft.data).map((b) => (b.id === branchId ? { ...b, value } : b));
      set({ draft: { ...draft, data: { ...draft.data, branches } } });
    },

    // Đặt nhãn hiển thị cho 1 nhánh (áp dụng cho MỌI nhánh, kể cả catch-all).
    draftSetBranchLabel: (branchId, label) => {
      const { draft } = get();
      if (!draft) return;
      const branches = readBranches(draft.data).map((b) => (b.id === branchId ? { ...b, label } : b));
      set({ draft: { ...draft, data: { ...draft.data, branches } } });
    },

    draftRemoveBranch: (branchId) => {
      const { draft } = get();
      if (!draft || branchId === CATCH_ALL_ID) return; // catch-all không xoá
      const branches = readBranches(draft.data).filter((b) => b.id !== branchId);
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
      const labelByHandle = new Map(branches.map((b) => [b.id, (b.label ?? '').trim()]));

      set({
        ...snapshot(),
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
                  const handle = e.sourceHandle ?? 'default';
                  const val = valueByHandle.get(handle) ?? '';
                  const lbl = labelByHandle.get(handle) ?? '';
                  // Nhãn dây ưu tiên label người dùng đặt, fallback về value.
                  return { ...e, condition: val || undefined, label: (lbl || val) || undefined };
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
