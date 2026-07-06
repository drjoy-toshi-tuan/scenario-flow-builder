import { parse } from 'yaml';
import {
  type FlowIR,
  type FlowNode,
  type FlowEdge,
  type NodeType,
  NODE_TYPES,
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

interface RawNode {
  id: string;
  type: string;
  next?: string;
  branches?: RawBranch[];
  [key: string]: unknown;
}

interface RawFlowFile {
  flow?: {
    name?: string;
    start?: string;
    facility?: string;
    nodes?: RawNode[];
  };
}

// Field mang tính "cấu trúc" (không phải tham số riêng của node) — không đưa vào data.
const STRUCTURAL_KEYS = new Set(['id', 'type', 'next', 'branches']);

function coerceNodeType(raw: string): NodeType {
  return (NODE_TYPES as readonly string[]).includes(raw) ? (raw as NodeType) : 'announce';
}

function edgeId(source: string, target: string, suffix?: string): string {
  return suffix ? `${source}->${target}#${suffix}` : `${source}->${target}`;
}

export function fromYaml(text: string): FlowIR {
  const parsed = parse(text) as RawFlowFile | null;
  const flow = parsed?.flow ?? {};
  const rawNodes = flow.nodes ?? [];

  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  // Node "start" tổng hợp: YAML không có node thật cho điểm bắt đầu.
  if (flow.start) {
    nodes.push({
      id: SYNTHETIC_START_ID,
      type: 'start',
      label: 'Start',
      position: { x: 0, y: 0 },
      data: {},
    });
    edges.push({
      id: edgeId(SYNTHETIC_START_ID, flow.start),
      source: SYNTHETIC_START_ID,
      target: flow.start,
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
    const node: FlowNode = {
      id: raw.id,
      type: nodeType,
      label: raw.id,
      position: { x: 0, y: 0 }, // ELK sẽ điền lại ở layout.ts
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
        if (branch.when && branch.to) {
          const handle = `b${index}`;
          dataBranches.push({ id: handle, value: branch.when, label });
          edges.push({
            id: edgeId(raw.id, branch.to, handle),
            source: raw.id,
            target: branch.to,
            sourceHandle: handle,
            condition: branch.when,
            label: label || branch.when,
          });
        } else if (branch.default) {
          // Nhánh mặc định (else) -> handle 'default', giá trị rỗng.
          dataBranches.push({ id: 'default', value: '', label });
          edges.push({
            id: edgeId(raw.id, branch.default, 'default'),
            source: raw.id,
            target: branch.default,
            sourceHandle: 'default',
            label: label || 'default',
          });
        }
      });
      if (nodeType === 'condition' && dataBranches.length > 0) {
        node.data.branches = dataBranches;
      }
    }
  }

  const now = new Date().toISOString();
  return {
    version: '1.0',
    meta: {
      id: slugify(flow.name ?? 'flow'),
      name: flow.name ?? 'Untitled flow',
      facility: flow.facility,
      createdAt: now,
      updatedAt: now,
    },
    nodes,
    edges,
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
