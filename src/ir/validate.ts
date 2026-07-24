import type { FlowNode, FlowEdge } from './types';
import { FIXED_REQUIRED_HANDLES, EDITABLE_BRANCH_TYPES, DEFAULT_HANDLE } from './branchRules';

// ─────────────────────────────────────────────────────────────────────────────
// Kiểm tra tính TOÀN VẸN của việc nối dây trong 1 flow (hàm THUẦN, test độc lập).
// Bất biến chính: mỗi node phải nối ĐỦ các handle ra bắt buộc của loại nó
//   - fixed (interaction/openai/faq/transfer…): theo FIXED_REQUIRED_HANDLES
//   - editable (nexus/logic/jump…): mỗi nhánh trong data.branches phải có 1 dây
//   - hangup: không cần nhánh ra
// KHÔNG chặn thao tác — chỉ trả danh sách vi phạm để cảnh báo / nạp lại cho AI.
// ─────────────────────────────────────────────────────────────────────────────

export interface FlowViolation {
  nodeId: string;
  nodeLabel: string;
  nodeType: FlowNode['type'];
  kind: 'missing-handle';
  handle: string; // handle ra chưa được nối
}

interface DataBranchLike {
  id?: unknown;
}

// Các handle RA mà 1 node BẮT BUỘC phải nối.
function requiredHandles(n: FlowNode): string[] {
  const fixed = FIXED_REQUIRED_HANDLES[n.type];
  if (fixed) return [...fixed];
  if (EDITABLE_BRANCH_TYPES.includes(n.type)) {
    const branches = (n.data?.branches as DataBranchLike[] | undefined) ?? [];
    return branches
      .map((b) => b?.id)
      .filter((x): x is string => typeof x === 'string' && x.length > 0);
  }
  return []; // hangup / loại khác: không bắt buộc nhánh ra
}

// Vi phạm nối dây của 1 flow (nodes/edges của đúng flow đó).
export function validateFlow(nodes: FlowNode[], edges: FlowEdge[]): FlowViolation[] {
  const wired = new Map<string, Set<string>>();
  for (const e of edges) {
    let set = wired.get(e.source);
    if (!set) {
      set = new Set<string>();
      wired.set(e.source, set);
    }
    set.add(e.sourceHandle ?? DEFAULT_HANDLE);
  }
  const out: FlowViolation[] = [];
  for (const n of nodes) {
    const need = requiredHandles(n);
    if (!need.length) continue;
    const have = wired.get(n.id);
    for (const h of need) {
      if (!have || !have.has(h)) {
        out.push({ nodeId: n.id, nodeLabel: n.label, nodeType: n.type, kind: 'missing-handle', handle: h });
      }
    }
  }
  return out;
}
