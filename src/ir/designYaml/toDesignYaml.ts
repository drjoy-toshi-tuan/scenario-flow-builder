import { stringify } from 'yaml';
import type { FlowIR, FlowEdge } from '../types';
import { DEFAULT_BLOCK_BY_NODE_TYPE, isDesignBlockType } from './blockTypeMap';
import type { DesignYamlPassthrough } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// FlowIR -> 設計書 YAML (round-trip với fromDesignYaml.ts). Hàm thuần.
//
// Nguyên tắc giống toYaml.ts: EDGES là nguồn sự thật cho next/conditions (không
// phải node.data.conditions cũ) — người dùng sửa dây trên canvas phải phản ánh
// đúng khi ghi lại. node.data.conditions (nếu còn khớp source/target) chỉ được
// dùng để khôi phục field phụ (label, field lạ trong từng nhánh cũ).
// ─────────────────────────────────────────────────────────────────────────────

interface OutCondition {
  match?: string;
  next: string;
  label?: string;
  [key: string]: unknown;
}

interface OutStep {
  step: string;
  type: string;
  next?: string;
  conditions?: OutCondition[];
  [key: string]: unknown;
}

function outgoing(edges: FlowEdge[], nodeId: string): FlowEdge[] {
  return edges.filter((e) => e.source === nodeId);
}

// Map handle -> field lạ của nhánh cũ (label, …), đọc từ node.data.conditions gốc.
function readOldConditionsByTarget(data: Record<string, unknown>): Map<string, RawConditionLike> {
  const map = new Map<string, RawConditionLike>();
  const raw = data.conditions;
  if (Array.isArray(raw)) {
    for (const c of raw as RawConditionLike[]) {
      if (c && typeof c.next === 'string') map.set(c.next, c);
    }
  }
  return map;
}

interface RawConditionLike {
  match?: string;
  next?: string;
  label?: string;
  [key: string]: unknown;
}

// Map handle -> giá trị điều kiện hiện tại (nguồn sự thật khi người dùng sửa qua
// editor nhánh có sẵn của canvas — giống hệt readDataBranches ở toYaml.ts).
function readDataBranches(data: Record<string, unknown>): Map<string, { value: string; label?: string }> {
  const map = new Map<string, { value: string; label?: string }>();
  const raw = data.branches;
  if (Array.isArray(raw)) {
    for (const b of raw) {
      if (b && typeof b.id === 'string') {
        map.set(b.id, {
          value: typeof b.value === 'string' ? b.value : '',
          label: typeof b.label === 'string' && b.label.trim() ? b.label : undefined,
        });
      }
    }
  }
  return map;
}

// Dựng danh sách conditions của 1 node từ CHÍNH edges/data của node đó — dùng lại
// cho cả node rẽ nhánh thật (nexus/logic/…) và node ẢO (xem syntheticRouterFor).
function buildConditions(nodeData: Record<string, unknown>, edges: FlowEdge[]): OutCondition[] {
  const oldByTarget = readOldConditionsByTarget(nodeData);
  const byHandle = readDataBranches(nodeData);
  return edges.map((e): OutCondition => {
    const handle = e.sourceHandle ?? 'default';
    // Nguồn sự thật ƯU TIÊN: node.data.branches (editor nhánh có sẵn của canvas
    // ghi vào đây) -> rồi edge.condition -> rồi field lạ của conditions cũ.
    const branchInfo = byHandle.get(handle);
    const old = oldByTarget.get(e.target);
    const match = branchInfo?.value || e.condition || old?.match || (handle === 'default' ? 'default' : '');
    // label: CHỈ lấy từ nguồn THẬT (data.branches do người dùng sửa qua editor,
    // hoặc conditions gốc) — bỏ qua edge.label vì đó là giá trị hiển thị canvas
    // có fallback (= match/'default'), lấy nhầm sẽ bịa field label khi xuất YAML.
    const label = branchInfo?.label ?? old?.label;
    const extra = old ? Object.fromEntries(Object.entries(old).filter(([k]) => k !== 'match' && k !== 'next' && k !== 'label')) : {};
    return {
      ...extra,
      match: match || 'default',
      next: e.target,
      ...(label ? { label } : {}),
    };
  });
}

export function toDesignYaml(ir: FlowIR, passthrough: DesignYamlPassthrough): string {
  const scenario_flow: OutStep[] = [];

  // Node "分岐" ẢO (fromDesignYaml.ts tạo cho hearing/faq/… — block type khai báo
  // conditions ngay trên step nhưng NodeType chỉ có 2 lối ra cố định trên canvas)
  // KHÔNG xuất thành step riêng — nhánh của nó GỘP NGƯỢC vào step gốc bên dưới.
  const routerConditionsByOriginalStep = new Map<string, OutCondition[]>();
  for (const node of ir.nodes) {
    const originalStep = node.data.syntheticRouterFor;
    if (typeof originalStep === 'string') {
      routerConditionsByOriginalStep.set(originalStep, buildConditions(node.data, outgoing(ir.edges, node.id)));
    }
  }

  for (const node of ir.nodes) {
    if (typeof node.data.syntheticRouterFor === 'string') continue; // node ảo -> không xuất step riêng

    const blockType =
      typeof node.data.blockType === 'string' && isDesignBlockType(node.data.blockType)
        ? node.data.blockType
        : (DEFAULT_BLOCK_BY_NODE_TYPE[node.type] ?? 'augment');

    const out: OutStep = { step: node.id, type: blockType };
    // Trải phẳng data (output_format/save_to/slot/termination_ref/…) trở lại cấp
    // step. Bỏ blockType/conditions/branches vì đó là dữ liệu cấu trúc (nhánh),
    // dựng lại bên dưới — KHÔNG được ghi field "branches" thẳng vào 設計書 (schema
    // đó dùng "conditions").
    for (const [key, value] of Object.entries(node.data)) {
      if (key === 'blockType' || key === 'conditions' || key === 'branches') continue;
      out[key] = value;
    }

    const routerConditions = routerConditionsByOriginalStep.get(node.id);
    if (routerConditions) {
      // Nhánh thật nằm ở node ẢO ngay sau step này (hearing/faq/…) — ghi ngược
      // vào conditions của step gốc, không dùng edges của CHÍNH step này (edge đó
      // chỉ là dây nối kỹ thuật tới node ảo, không phải nhánh thật).
      if (routerConditions.length > 0) out.conditions = routerConditions;
    } else {
      const edges = outgoing(ir.edges, node.id);
      const hasBranching = edges.some((e) => (e.sourceHandle ?? 'default') !== 'default') || edges.length > 1;
      if (hasBranching) out.conditions = buildConditions(node.data, edges);
      else if (edges[0]) out.next = edges[0].target;
    }

    scenario_flow.push(out);
  }

  const doc = {
    ...passthrough,
    scenario_flow,
  };

  return stringify(doc, { lineWidth: 0 });
}
