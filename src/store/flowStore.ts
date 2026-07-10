import { create } from 'zustand';
import type { FlowIR, FlowEdge, FlowNode, NodeType, SubFlow } from '../ir/types';
import { fromYaml } from '../ir/fromYaml';
import { toYaml } from '../ir/toYaml';
import { layout } from '../ir/layout';
import { NODE_CONFIG } from '../ui/nodeConfig';
import {
  defaultDataFor,
  readBranches,
  effectiveBranches,
  catchAllEditable,
  BRANCH_SCHEMA,
  CATCH_ALL_ID,
  MODULE_DEFAULT_BRANCHES,
  MODULE_FIXED_BRANCHES,
  type DataBranch,
} from '../ui/nodeSchema';
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
  // ir.nodes/edges là graph ĐANG MỞ (main flow hoặc 1 sub flow — xem activeFlowId).
  // Khi đang ở sub flow: graph main tạm cất ở mainStash; slot của sub flow trong
  // ir.subflows có thể cũ — assembleDoc() ghép lại tài liệu đầy đủ khi cần (export).
  ir: FlowIR | null;
  selectedNodeId: string | null;
  draft: NodeDraft | null;
  // Ý định chuyển chọn (đổi node / đóng panel) đang chờ xác nhận vì draft còn dở.
  pendingSelect: { id: string | null } | null;

  // Flow đang mở trên canvas: 'main' hoặc id của 1 sub flow.
  activeFlowId: string;
  mainStash: { nodes: FlowNode[]; edges: FlowEdge[] } | null;
  // Chuyển sang main flow / sub flow khác (tự auto-layout lần đầu mở sub flow).
  switchFlow: (id: string) => Promise<void>;
  // Tạo sub flow mới (seed node Start) rồi chuyển sang nó.
  createSubflow: (name: string) => Promise<void>;
  // Đổi tên sub flow — các node Jump đang trỏ tên cũ được cập nhật theo tên mới.
  renameSubflow: (id: string, name: string) => void;
  // Xoá sub flow — đang đứng trong nó thì đưa về main flow.
  deleteSubflow: (id: string) => void;

  // Panel nổi vùng canvas ('Thêm node' / 'Main-Sub Flow') — mở panel này tự đóng panel kia.
  canvasPanel: 'addNode' | 'flows' | null;
  setCanvasPanel: (panel: 'addNode' | 'flows' | null) => void;

  // Đang kéo/di chuyển canvas (pan/zoom) -> ẩn thanh công cụ nổi trên node.
  isPanning: boolean;
  setPanning: (value: boolean) => void;

  // Cấu hình IVR Property (施設名 / Office ID / môi trường / TTS / STT) — dùng cho
  // modal "Cài đặt IVR Property". Giữ độc lập với ir để không bị reset khi nạp lại YAML.
  ivr: IvrSettings;
  setIvr: (patch: Partial<IvrSettings>) => void;
  // Thời điểm import YAML (yyyy-MM-dd HH:mm) -> điền vào 作成日時 của IVR Property.
  ivrCreatedAt: string;

  // Tài liệu ĐẦY ĐỦ (main + mọi sub flow) — dùng cho export YAML, option xuyên
  // flow (searchSelect) và context gửi AI. Không đổi state.
  assembleDoc: () => FlowIR | null;

  // Nạp YAML -> IR -> auto-layout, rồi set vào store.
  loadYaml: (text: string) => Promise<void>;
  // Chạy lại auto-layout trên IR hiện tại.
  autoLayout: () => Promise<void>;
  // Xuất IR hiện tại ra chuỗi YAML (round-trip).
  exportYaml: () => string;

  // Cập nhật metadata flow (name/facility/author/createdAt/updatedAt) — dùng khi
  // lưu về repo để đóng dấu 更新日時/作成者. Không ghi vào lịch sử Undo.
  setMeta: (patch: Partial<FlowIR['meta']>) => void;

  // Cập nhật vị trí sau khi kéo-thả (commit vào IR).
  setNodePositions: (positions: Record<string, { x: number; y: number }>) => void;

  // Vá data của 1 node ĐÃ COMMIT (không qua draft, không ghi lịch sử Undo) —
  // dùng cho ghi kết quả nền như phần giải thích script của AI.
  setNodeData: (id: string, patch: Record<string, unknown>) => void;

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

// Slug id cho sub flow (suy từ tên, bảo đảm khác rỗng).
function slugifyName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'subflow';
}

// Graph khởi tạo của sub flow mới: TRỐNG — node Start chỉ tồn tại ở main flow
// (sub flow được gọi qua Jump, xử lý xong node cuối thì tự quay về main flow).
function seedSubflowGraph(): { nodes: FlowNode[]; edges: FlowEdge[] } {
  return { nodes: [], edges: [] };
}

export const useFlowStore = create<FlowState>((set, get) => {
  // Chụp IR hiện tại vào `past` (xoá `future`) — gọi TRƯỚC mỗi thay đổi có thể undo.
  // Trả về mảnh state để trộn vào set({...}).
  const snapshot = (): Partial<FlowState> => {
    const { ir, past } = get();
    if (!ir) return {};
    return { past: [...past, ir].slice(-HISTORY_LIMIT), future: [] };
  };

  // Ghép lại TÀI LIỆU đầy đủ (main + toàn bộ sub flow) từ trạng thái hiện tại:
  // graph đang mở nằm ở ir.nodes/edges nên phải trả về đúng slot của nó.
  const assembleDoc = (): FlowIR | null => {
    const { ir, activeFlowId, mainStash } = get();
    if (!ir) return null;
    if (activeFlowId === 'main' || !mainStash) return ir;
    return {
      ...ir,
      nodes: mainStash.nodes,
      edges: mainStash.edges,
      subflows: (ir.subflows ?? []).map((s) =>
        s.id === activeFlowId ? { ...s, nodes: ir.nodes, edges: ir.edges } : s,
      ),
    };
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

    activeFlowId: 'main',
    mainStash: null,
    canvasPanel: null,
    setCanvasPanel: (panel) => set({ canvasPanel: panel }),

    assembleDoc: () => assembleDoc(),

    switchFlow: async (id) => {
      const { activeFlowId } = get();
      if (id === activeFlowId) return;
      const doc = assembleDoc();
      if (!doc) return;

      let next: FlowIR;
      let mainStash: FlowState['mainStash'];
      if (id === 'main') {
        next = doc; // doc.nodes/edges chính là main flow
        mainStash = null;
      } else {
        const target = (doc.subflows ?? []).find((s) => s.id === id);
        if (!target) return;
        next = { ...doc, nodes: target.nodes, edges: target.edges };
        mainStash = { nodes: doc.nodes, edges: doc.edges };
      }

      // Sub flow đọc từ YAML chưa có toạ độ (0,0 hết) -> auto-layout lần đầu mở.
      const needsLayout =
        next.nodes.length > 1 && next.nodes.every((n) => n.position.x === 0 && n.position.y === 0);
      if (needsLayout) next = await layout(next);

      set({
        ir: next,
        mainStash,
        activeFlowId: id,
        // Đổi flow -> đóng panel setting + reset lịch sử Undo (snapshot không theo flow).
        selectedNodeId: null,
        draft: null,
        pendingSelect: null,
        pendingDelete: null,
        past: [],
        future: [],
        canvasPanel: null,
      });
    },

    renameSubflow: (id, name) => {
      const doc = assembleDoc();
      if (!doc) return;
      const { activeFlowId } = get();
      const sub = (doc.subflows ?? []).find((s) => s.id === id);
      const trimmed = name.trim();
      if (!sub || !trimmed || trimmed === sub.name) return;
      // Tên duy nhất giữa các sub flow còn lại.
      const taken = new Set((doc.subflows ?? []).filter((s) => s.id !== id).map((s) => s.name));
      let finalName = trimmed;
      let n = 2;
      while (taken.has(finalName)) finalName = `${trimmed} ${n++}`;

      // Node Jump trỏ theo TÊN -> đổi tên phải cập nhật mọi graph (main + các sub).
      const oldName = sub.name;
      const retargetJumps = (nodes: FlowNode[]) =>
        nodes.map((node) =>
          node.type === 'jump' && node.data.subflow === oldName
            ? { ...node, data: { ...node.data, subflow: finalName } }
            : node,
        );
      const newDoc: FlowIR = {
        ...doc,
        meta: { ...doc.meta, updatedAt: new Date().toISOString() },
        nodes: retargetJumps(doc.nodes),
        subflows: (doc.subflows ?? []).map((s) => ({
          ...s,
          ...(s.id === id ? { name: finalName } : {}),
          nodes: retargetJumps(s.nodes),
        })),
      };

      // Tách lại theo flow đang mở (doc là tài liệu đầy đủ). Reset Undo: snapshot
      // không bao mainStash nên không hoàn tác xuyên cấu trúc doc được.
      const base = {
        selectedNodeId: null,
        draft: null,
        pendingSelect: null,
        past: [] as FlowIR[],
        future: [] as FlowIR[],
      };
      if (activeFlowId === 'main') {
        set({ ...base, ir: newDoc, mainStash: null });
      } else {
        const target = (newDoc.subflows ?? []).find((s) => s.id === activeFlowId);
        if (!target) return;
        set({
          ...base,
          ir: { ...newDoc, nodes: target.nodes, edges: target.edges },
          mainStash: { nodes: newDoc.nodes, edges: newDoc.edges },
        });
      }
    },

    deleteSubflow: (id) => {
      const doc = assembleDoc();
      if (!doc) return;
      const { activeFlowId } = get();
      if (!(doc.subflows ?? []).some((s) => s.id === id)) return;
      const newDoc: FlowIR = {
        ...doc,
        meta: { ...doc.meta, updatedAt: new Date().toISOString() },
        subflows: (doc.subflows ?? []).filter((s) => s.id !== id),
      };
      const base = {
        selectedNodeId: null,
        draft: null,
        pendingSelect: null,
        pendingDelete: null,
        past: [] as FlowIR[],
        future: [] as FlowIR[],
      };
      if (activeFlowId === 'main' || activeFlowId === id) {
        // Xoá flow đang mở -> quay về main flow.
        set({ ...base, ir: newDoc, mainStash: null, activeFlowId: 'main' });
      } else {
        const target = (newDoc.subflows ?? []).find((s) => s.id === activeFlowId);
        if (!target) return;
        set({
          ...base,
          ir: { ...newDoc, nodes: target.nodes, edges: target.edges },
          mainStash: { nodes: newDoc.nodes, edges: newDoc.edges },
        });
      }
    },

    createSubflow: async (name) => {
      const doc = assembleDoc();
      if (!doc) return;
      const subflows = doc.subflows ?? [];
      // Tên duy nhất (thêm -2, -3… nếu trùng); id slug duy nhất theo tên.
      const taken = new Set(subflows.map((s) => s.name));
      let finalName = name.trim() || 'Sub Flow';
      let n = 2;
      while (taken.has(finalName)) finalName = `${name.trim() || 'Sub Flow'} ${n++}`;
      const usedIds = new Set(subflows.map((s) => s.id));
      let id = slugifyName(finalName);
      let i = 2;
      while (usedIds.has(id)) id = `${slugifyName(finalName)}-${i++}`;

      const sub: SubFlow = { id, name: finalName, ...seedSubflowGraph() };
      set({
        ir: {
          ...doc,
          meta: { ...doc.meta, updatedAt: new Date().toISOString() },
          subflows: [...subflows, sub],
          // Chuyển thẳng sang sub flow mới (graph chỉ có node Start).
          nodes: sub.nodes,
          edges: sub.edges,
        },
        mainStash: { nodes: doc.nodes, edges: doc.edges },
        activeFlowId: id,
        selectedNodeId: null,
        draft: null,
        pendingSelect: null,
        pendingDelete: null,
        past: [],
        future: [],
        canvasPanel: null,
      });
    },

    ivr: { ...DEFAULT_IVR_SETTINGS },
    setIvr: (patch) => set({ ivr: { ...get().ivr, ...patch } }),
    ivrCreatedAt: formatDateTime(new Date()),

    loadYaml: async (text) => {
      const parsed = fromYaml(text);
      // File đã lưu toạ độ (mọi lần lưu đều ghi position) -> GIỮ NGUYÊN bố cục, không
      // auto-layout lại. Chỉ auto-layout khi toạ độ trống (file cũ / viết tay: tất cả 0,0).
      const needsLayout =
        parsed.nodes.length > 1 &&
        parsed.nodes.every((n) => n.position.x === 0 && n.position.y === 0);
      const laidOut = needsLayout ? await layout(parsed) : parsed;
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
        // Nạp file mới -> về main flow + reset lịch sử Undo/Redo.
        activeFlowId: 'main',
        mainStash: null,
        canvasPanel: null,
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
      // Xuất TÀI LIỆU đầy đủ (main + sub flow), kể cả khi đang mở 1 sub flow.
      const doc = assembleDoc();
      return doc ? toYaml(doc) : '';
    },

    setMeta: (patch) => {
      const { ir } = get();
      if (!ir) return;
      set({ ir: { ...ir, meta: { ...ir.meta, ...patch } } });
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

    setNodeData: (id, patch) => {
      const { ir } = get();
      if (!ir) return;
      set({
        ir: {
          ...ir,
          nodes: ir.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
        },
      });
    },

    addNode: (type, position) => {
      const { ir, activeFlowId } = get();
      if (!ir) return '';
      // Start là điểm bắt đầu duy nhất và CHỈ có ở main flow (sub flow không có Start).
      if (type === 'start' && (activeFlowId !== 'main' || ir.nodes.some((n) => n.type === 'start')))
        return '';
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
      // 1 output chỉ nối được 1 dây: nối dây mới từ handle đang có dây -> THAY dây cũ.
      const handle = edge.sourceHandle ?? 'default';
      const edges = ir.edges.filter(
        (e) => !(e.source === edge.source && (e.sourceHandle ?? 'default') === handle),
      );
      set({ ...snapshot(), ir: { ...ir, edges: [...edges, edge] } });
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
      const data: Record<string, unknown> = { ...draft.data, [key]: value };
      if (key === 'moduleType' && typeof value === 'string') {
        const fixed = MODULE_FIXED_BRANCHES[value];
        const defaults = MODULE_DEFAULT_BRANCHES[value];
        if (fixed) {
          // Module nhánh CỐ ĐỊNH (Incoming Classifier / Date Of Call Classifier):
          // THAY HẲN bằng bộ chuẩn — không giữ nhánh của module trước.
          data.branches = fixed.map((b) => ({ ...b }));
        } else if (defaults) {
          // Module có bộ nhánh mặc định sửa được (CDC): chỉ seed khi node chưa có
          // nhánh tuỳ biến nào.
          const hasCustom = readBranches(data).some((b) => b.id !== CATCH_ALL_ID);
          if (!hasCustom) data.branches = defaults.map((b) => ({ ...b }));
        }
      }
      set({ draft: { ...draft, data } });
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
      const { draft, ir, selectedNodeId } = get();
      if (!draft) return;
      // Catch-all mặc định không sửa value — TRỪ node logic Module Result Binder.
      if (branchId === CATCH_ALL_ID) {
        const node = ir?.nodes.find((n) => n.id === selectedNodeId);
        if (!node || !catchAllEditable(node.type, draft.data)) return;
      }
      const branches = readBranches(draft.data).map((b) => (b.id === branchId ? { ...b, value } : b));
      set({ draft: { ...draft, data: { ...draft.data, branches } } });
    },

    // Đặt nhãn hiển thị cho 1 nhánh (áp dụng cho MỌI nhánh, kể cả catch-all).
    // Dùng effectiveBranches để nhánh sinh từ Pair (CMR) cũng đặt label được
    // (entry pairN có thể chưa tồn tại trong data.branches).
    draftSetBranchLabel: (branchId, label) => {
      const { draft, ir, selectedNodeId } = get();
      if (!draft) return;
      const node = ir?.nodes.find((n) => n.id === selectedNodeId);
      const branches = effectiveBranches(node?.type ?? 'nexus', draft.data).map((b) =>
        b.id === branchId ? { ...b, label } : b,
      );
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
      // Nhánh hiệu lực (CMR sinh từ Pair) — cũng persist vào data.branches khi lưu
      // để toYaml/round-trip có nguồn sự thật đầy đủ.
      const branches = editable ? effectiveBranches(node.type, draft.data) : [];
      const branchIds = new Set(branches.map((b) => b.id));
      const valueByHandle = new Map(branches.map((b) => [b.id, b.value]));
      const labelByHandle = new Map(branches.map((b) => [b.id, (b.label ?? '').trim()]));
      const committedData = editable ? { ...draft.data, branches } : draft.data;

      set({
        ...snapshot(),
        ir: {
          ...ir,
          meta: { ...ir.meta, updatedAt: new Date().toISOString() },
          nodes: ir.nodes.map((n) =>
            n.id === selectedNodeId ? { ...n, label: draft.label, data: committedData } : n,
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
