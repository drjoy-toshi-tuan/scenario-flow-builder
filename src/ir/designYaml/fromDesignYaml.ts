import { parse } from 'yaml';
import { EDITABLE_BRANCH_TYPES, type FlowIR, type FlowNode, type FlowEdge, type NodeType } from '../types';
import { BLOCK_TO_NODE_TYPE, isDesignBlockType } from './blockTypeMap';
import { KNOWN_TOP_LEVEL_KEYS, type DesignYamlPassthrough } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// 設計書 YAML (scenario_flow blocks) -> FlowIR. Hàm thuần, không phụ thuộc React.
//
// Khác với fromYaml.ts (schema riêng của webapp), ở đây input là 設計書 do pipeline
// gen_flow tiêu thụ (`pipeline/schemas/qa_validator.py::KNOWN_BLOCK_TYPES`, 26 block
// type). Cấu trúc mong đợi (xem fixtures/design-flow-proto.yaml):
//   scenario_flow: [{ step, type, next?, conditions?, ...field riêng theo type }]
//   termination_patterns / step_details / basic_info / ... — section rời, giữ
//   nguyên qua `passthrough` (không phải graph, webapp chưa cần hiểu).
//
// Quy tắc map:
//   - step        -> node.id VÀ node.label (設計書 không có field tên hiển thị riêng)
//   - type        -> node.data.blockType (giữ NGUYÊN giá trị gốc — nguồn sự thật khi
//                    ghi lại) + NodeType hiển thị qua BLOCK_TO_NODE_TYPE
//   - next        -> 1 edge sourceHandle 'default'
//   - conditions[].match -> next  -> 1 edge/nhánh; match:"default" -> sourceHandle 'default'
//   - Field lạ (output_format/save_to/slot/termination_ref/…) -> gom vào node.data
//     để round-trip không mất (giống STRUCTURAL_KEYS ở fromYaml.ts).
// ─────────────────────────────────────────────────────────────────────────────

interface RawCondition {
  match?: string;
  next?: string;
  label?: string;
  [key: string]: unknown;
}

interface RawStep {
  step: string;
  type: string;
  next?: string;
  conditions?: RawCondition[];
  [key: string]: unknown;
}

interface RawDesignDoc {
  scenario_flow?: RawStep[];
  [key: string]: unknown;
}

const STRUCTURAL_KEYS = new Set(['step', 'type', 'next', 'conditions']);

function coerceNodeType(rawType: string): NodeType {
  return isDesignBlockType(rawType) ? BLOCK_TO_NODE_TYPE[rawType] : 'logic';
}

function edgeId(source: string, target: string, suffix?: string): string {
  return suffix ? `${source}->${target}#${suffix}` : `${source}->${target}`;
}

export interface FromDesignYamlResult {
  ir: FlowIR;
  passthrough: DesignYamlPassthrough;
}

export function fromDesignYaml(text: string, meta: { id: string; name: string; facility?: string }): FromDesignYamlResult {
  const doc = (parse(text) as RawDesignDoc | null) ?? {};
  const rawSteps = doc.scenario_flow ?? [];

  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  for (const raw of rawSteps) {
    const nodeType = coerceNodeType(raw.type);
    const data: Record<string, unknown> = { blockType: raw.type };
    for (const [key, value] of Object.entries(raw)) {
      if (!STRUCTURAL_KEYS.has(key)) data[key] = value;
    }
    // Giữ nguyên conditions gốc (label, field lạ trong từng nhánh) để ghi lại
    // đúng khi chưa có edge nào bị người dùng sửa (xem toDesignYaml.ts).
    if (Array.isArray(raw.conditions)) data.conditions = raw.conditions;

    nodes.push({
      id: raw.step,
      type: nodeType,
      label: raw.step,
      position: { x: 0, y: 0 }, // auto-layout điền lại khi mở (giống fromYaml.ts)
      data,
    });

    if (typeof raw.next === 'string') {
      edges.push({
        id: edgeId(raw.step, raw.next),
        source: raw.step,
        target: raw.next,
        sourceHandle: 'default',
      });
    }

    if (Array.isArray(raw.conditions)) {
      // data.branches (id/value/label) -> canvas hiển thị ĐÚNG số chấm nối ở đáy
      // node và dùng được editor nhánh có sẵn (nexus/logic/classifier/…), giống
      // hệt quy ước fromYaml.ts — không cần xây editor riêng cho 設計書.
      const editableBranches = EDITABLE_BRANCH_TYPES.includes(nodeType);
      // Block type như hearing/faq: CHÍNH bản pipeline cho khai báo `conditions`
      // NGAY trên step đó (scaffold_generator.py tự chèn module rẽ nhánh ẩn khi
      // build BIVR) — nhưng NodeType tương ứng (interaction/faq…) chỉ có 2 lối
      // ra CỐ ĐỊNH trên canvas (BRANCH_SCHEMA.mode='fixed'), không rẽ N-nhánh
      // được. Giải pháp: tách 1 node "分岐" ẢO ngay sau step gốc — người dùng
      // kéo-thả sửa nhánh ở đó (dùng editor nhánh nexus có sẵn); lúc lưu lại,
      // toDesignYaml.ts GỘP NGƯỢC nhánh của node ảo vào `conditions` của step gốc
      // (không xuất node ảo thành step riêng — xem `syntheticRouterFor`).
      const routerId = editableBranches ? raw.step : `${raw.step}__branch`;
      const branchSource = editableBranches ? raw.step : routerId;
      if (!editableBranches) {
        edges.push({
          id: edgeId(raw.step, routerId, 'router'),
          source: raw.step,
          target: routerId,
          sourceHandle: 'default',
        });
        nodes.push({
          id: routerId,
          type: 'nexus',
          label: `${raw.step}：分岐`,
          position: { x: 0, y: 0 },
          data: { syntheticRouterFor: raw.step },
        });
      }

      const dataBranches: { id: string; value: string; label?: string }[] = [];
      raw.conditions.forEach((cond, index) => {
        if (typeof cond.next !== 'string') return;
        const match = typeof cond.match === 'string' ? cond.match : '';
        const isDefault = match === 'default' || match === '';
        const handle = isDefault ? 'default' : `c${index}`;
        // Label THẬT (chỉ khi 設計書 có field label rõ ràng) — KHÔNG defaut, để
        // toDesignYaml phân biệt được "chưa từng có label" với "label = match".
        // Nếu default hoá ở đây, xuất lại sẽ bịa thêm field label không có gốc.
        const realLabel = typeof cond.label === 'string' ? cond.label : undefined;
        dataBranches.push({ id: handle, value: match, ...(realLabel ? { label: realLabel } : {}) });
        edges.push({
          id: edgeId(branchSource, cond.next, handle),
          source: branchSource,
          target: cond.next,
          sourceHandle: handle,
          ...(isDefault ? {} : { condition: match }),
          // edge.label: CHỈ dùng để canvas hiển thị chữ trên dây, không phải nguồn
          // sự thật khi ghi lại YAML (xem readOldConditionsByTarget/toDesignYaml.ts).
          label: realLabel ?? match ?? 'default',
        });
      });

      if (editableBranches) {
        if (dataBranches.length > 0) data.branches = dataBranches;
      } else {
        // Gắn branches vào NODE ẢO (nexus) — node gốc (hearing/faq…) giữ nguyên
        // 2 lối ra cố định, không có data.branches.
        const routerNode = nodes[nodes.length - 1];
        if (dataBranches.length > 0) routerNode.data.branches = dataBranches;
      }
    }
  }

  // Mọi section top-level không phải scenario_flow -> giữ nguyên nguyên trạng
  // (basic_info/flow_structure/context_fields/hearing_items/termination_patterns/
  // step_details/…) — webapp chưa hiểu nhưng KHÔNG được làm mất khi lưu lại.
  const passthrough: DesignYamlPassthrough = {};
  for (const [key, value] of Object.entries(doc)) {
    if (!KNOWN_TOP_LEVEL_KEYS.has(key)) passthrough[key] = value;
  }

  const ir: FlowIR = {
    version: '1.0',
    meta: {
      id: meta.id,
      name: meta.name,
      facility: meta.facility,
      createdAt: '',
      updatedAt: '',
    },
    nodes,
    edges,
  };

  return { ir, passthrough };
}
