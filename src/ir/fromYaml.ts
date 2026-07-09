import { parse } from 'yaml';
import {
  type FlowIR,
  type FlowNode,
  type FlowEdge,
  type NodeType,
  NODE_TYPES,
  LEGACY_TYPE_ALIASES,
  EDITABLE_BRANCH_TYPES,
  SYNTHETIC_START_ID,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// YAML -> IR. Hàm thuần, không phụ thuộc React.
//
// Cấu trúc YAML mong đợi (xem fixtures/sample-flow.yaml):
//   flow:
//     name, start, nodes[]
//   node: { id, type, next?, branches?, ...các field riêng theo type }
//
// Quy tắc map:
//   - next: X                    -> 1 edge sourceHandle 'default'
//   - branches[].when -> to      -> 1 edge, condition = when, hiển thị trên dây
//   - branches[].default -> to   -> 1 edge sourceHandle 'default'
//   - flow.start                 -> tạo node 'start' tổng hợp + edge tới node đầu
//   - Field lạ (text/prompt/mode/…) -> gom hết vào node.data để round-trip.
// ─────────────────────────────────────────────────────────────────────────────

interface RawBranch {
  when?: string;
  to?: string;
  default?: string;
  label?: string; // nhãn hiển thị trên dây (tuỳ chọn)
}

interface RawPos {
  x?: unknown;
  y?: unknown;
}

interface RawNode {
  id: string;
  name?: string; // tên hiển thị (label) do người dùng đặt
  type: string;
  position?: RawPos; // toạ độ đã lưu (giữ bố cục, khỏi auto-layout lại)
  next?: string;
  branches?: RawBranch[];
  [key: string]: unknown;
}

interface RawSubflow {
  name?: string;
  start?: string;
  nodes?: RawNode[];
}

interface RawFlowFile {
  flow?: {
    name?: string;
    start?: string;
    startPosition?: RawPos; // toạ độ node Start tổng hợp
    facility?: string;
    author?: string;
    createdAt?: string;
    updatedAt?: string;
    nodes?: RawNode[];
    subflows?: RawSubflow[];
  };
}

// Đọc toạ độ đã lưu (an toàn kiểu); thiếu/không hợp lệ -> {0,0} (báo hiệu cần layout).
function readPos(raw: RawPos | undefined): { x: number; y: number } {
  const x = typeof raw?.x === 'number' ? raw.x : 0;
  const y = typeof raw?.y === 'number' ? raw.y : 0;
  return { x, y };
}

// Field mang tính "cấu trúc" (không phải tham số riêng của node) — không đưa vào data.
// `name` = tên hiển thị (label) do người dùng đặt; đọc riêng ra node.label.
const STRUCTURAL_KEYS = new Set(['id', 'name', 'type', 'position', 'next', 'branches']);

function coerceNodeType(raw: string): NodeType {
  if (raw in LEGACY_TYPE_ALIASES) return LEGACY_TYPE_ALIASES[raw]; // file cũ: input/condition/script/llm
  return (NODE_TYPES as readonly string[]).includes(raw) ? (raw as NodeType) : 'announce';
}

// Các giá trị hợp lệ của bộ chọn Module trong node logic. File cũ lưu bộ chọn này
// ở key `module`; nay `module` là THAM SỐ của Clinic Day Classifier / Module Result
// Binder (参照元モジュール) nên bộ chọn chuyển sang key `moduleType`.
const LOGIC_MODULE_NAMES = new Set([
  'Script',
  'Clinic Day Classifier',
  'Context Match Router',
  'Module Result Binder',
]);

function edgeId(source: string, target: string, suffix?: string): string {
  return suffix ? `${source}->${target}#${suffix}` : `${source}->${target}`;
}

// Parse 1 graph (main flow hoặc sub flow): danh sách node YAML + điểm bắt đầu
// -> nodes/edges IR (kèm node "start" tổng hợp nếu có `start`).
function parseGraph(
  rawNodes: RawNode[],
  start: string | undefined,
  startPosition?: RawPos,
): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  // Node "start" tổng hợp: YAML không có node thật cho điểm bắt đầu.
  if (start) {
    nodes.push({
      id: SYNTHETIC_START_ID,
      type: 'start',
      label: 'Start',
      position: readPos(startPosition), // giữ toạ độ đã lưu (nếu có)
      data: {},
    });
    edges.push({
      id: edgeId(SYNTHETIC_START_ID, start),
      source: SYNTHETIC_START_ID,
      target: start,
      sourceHandle: 'default',
    });
  }

  for (const raw of rawNodes) {
    // Gom mọi field không-cấu-trúc vào data để giữ nguyên khi export.
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!STRUCTURAL_KEYS.has(key)) data[key] = value;
    }

    const nodeType = coerceNodeType(raw.type);
    // Migrate key bộ chọn module của node logic: module -> moduleType (file cũ).
    if (
      nodeType === 'logic' &&
      data.moduleType == null &&
      typeof data.module === 'string' &&
      LOGIC_MODULE_NAMES.has(data.module)
    ) {
      data.moduleType = data.module;
      delete data.module;
    }
    const node: FlowNode = {
      id: raw.id,
      type: nodeType,
      // Tên hiển thị: ưu tiên field `name` (label người dùng đặt), fallback về id.
      label: typeof raw.name === 'string' && raw.name.trim() ? raw.name : raw.id,
      // Toạ độ đã lưu (nếu có); thiếu -> {0,0} -> loadYaml/switchFlow sẽ ELK layout.
      position: readPos(raw.position),
      data,
    };
    nodes.push(node);

    // next -> edge default
    if (typeof raw.next === 'string') {
      edges.push({
        id: edgeId(raw.id, raw.next),
        source: raw.id,
        target: raw.next,
        sourceHandle: 'default',
      });
    }

    // branches -> mỗi nhánh là 1 edge; đồng thời dựng danh sách nhánh tự do (data.branches)
    // để các chấm nối ở đáy node hiển thị đúng số lượng kể cả khi chưa nối dây.
    if (Array.isArray(raw.branches)) {
      const dataBranches: { id: string; value: string; label?: string }[] = [];
      raw.branches.forEach((branch, index) => {
        const label = typeof branch.label === 'string' ? branch.label : undefined;
        // Nhánh default (catch-all) xét TRƯỚC: có thể kèm `when` (value tuỳ biến
        // của Module Result Binder) — vẫn giữ handle 'default'.
        if (branch.default) {
          const value = typeof branch.when === 'string' ? branch.when : '';
          dataBranches.push({ id: 'default', value, label });
          edges.push({
            id: edgeId(raw.id, branch.default, 'default'),
            source: raw.id,
            target: branch.default,
            sourceHandle: 'default',
            ...(value ? { condition: value } : {}),
            label: label || value || 'default',
          });
        } else if (branch.when && branch.to) {
          // Node logic (Context Match Router): nhánh Pair dùng handle 'pairN' để liên
          // động với danh sách Pair trong panel. Value mới là '1'/'2'…; vẫn nhận
          // dạng cũ 'Pair1' cho file đã lưu trước đó.
          const isCmr = nodeType === 'logic' && data.moduleType === 'Context Match Router';
          const pairMatch = isCmr ? /^(?:Pair)?(\d+)$/.exec(branch.when) : null;
          const handle = pairMatch ? `pair${pairMatch[1]}` : `b${index}`;
          dataBranches.push({ id: handle, value: branch.when, label });
          edges.push({
            id: edgeId(raw.id, branch.to, handle),
            source: raw.id,
            target: branch.to,
            sourceHandle: handle,
            condition: branch.when,
            label: label || branch.when,
          });
        }
      });
      if (EDITABLE_BRANCH_TYPES.includes(nodeType) && dataBranches.length > 0) {
        node.data.branches = dataBranches;
      }
    }
  }

  return { nodes, edges };
}

export function fromYaml(text: string): FlowIR {
  const parsed = parse(text) as RawFlowFile | null;
  const flow = parsed?.flow ?? {};

  const { nodes, edges } = parseGraph(flow.nodes ?? [], flow.start, flow.startPosition);

  // Sub Flow: mỗi entry là 1 graph riêng (name/nodes), id = slug duy nhất.
  // Sub flow KHÔNG có node Start (chỉ main flow có) — bỏ qua field start nếu file cũ còn.
  const usedIds = new Set<string>();
  const subflows = (flow.subflows ?? [])
    .filter((raw) => typeof raw?.name === 'string' && raw.name.trim())
    .map((raw) => {
      const name = raw.name!.trim();
      let id = slugify(name);
      let i = 2;
      while (usedIds.has(id)) id = `${slugify(name)}-${i++}`;
      usedIds.add(id);
      return { id, name, ...parseGraph(raw.nodes ?? [], undefined) };
    });

  // Giữ nguyên 作成日時/更新日時/作成者 nếu file đã có; nếu chưa thì để trống
  // (không tự bịa thời điểm import — tránh ghi đè khi lưu lại).
  return {
    version: '1.0',
    meta: {
      id: slugify(flow.name ?? 'flow'),
      name: flow.name ?? 'Untitled flow',
      facility: flow.facility,
      author: flow.author,
      createdAt: flow.createdAt ?? '',
      updatedAt: flow.updatedAt ?? '',
    },
    nodes,
    edges,
    ...(subflows.length > 0 ? { subflows } : {}),
  };
}

function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'flow';
}
