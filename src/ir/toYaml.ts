import { stringify } from 'yaml';
import { type FlowIR, type FlowEdge, EDITABLE_BRANCH_TYPES, SYNTHETIC_START_ID } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// IR -> YAML (round-trip cơ bản). Hàm thuần.
//
// Dựng lại đúng cấu trúc mà fromYaml đã đọc:
//   - node 'start' tổng hợp  -> field flow.start (không xuất thành node)
//   - edge default (1 nhánh) -> next: <target>
//   - node condition         -> branches[] (when/to hoặc default)
//   - data của node          -> trải phẳng thành các field riêng
// ─────────────────────────────────────────────────────────────────────────────

interface OutBranch {
  when?: string;
  to?: string;
  default?: string;
  label?: string;
}

interface OutNode {
  id: string;
  name?: string;
  type: string;
  [key: string]: unknown;
  next?: string;
  branches?: OutBranch[];
}

function outgoing(edges: FlowEdge[], nodeId: string): FlowEdge[] {
  return edges.filter((e) => e.source === nodeId);
}

// Map handleId -> { value điều kiện, label hiển thị }, đọc từ node.data.branches.
interface BranchInfo {
  value: string;
  label?: string;
}
function readDataBranches(data: Record<string, unknown>): Map<string, BranchInfo> {
  const map = new Map<string, BranchInfo>();
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

// Serialize 1 graph (main flow hoặc sub flow) -> { start, nodes } dạng YAML.
function serializeGraph(
  irNodes: FlowIR['nodes'],
  irEdges: FlowEdge[],
): { start?: string; nodes: OutNode[] } {
  // Điểm bắt đầu = target của edge đi ra từ node 'start' tổng hợp (nếu có).
  const startEdge = irEdges.find((e) => e.source === SYNTHETIC_START_ID);
  const start = startEdge?.target;

  const outNodes: OutNode[] = [];

  for (const node of irNodes) {
    if (node.id === SYNTHETIC_START_ID) continue; // start là field, không phải node YAML

    const out: OutNode = { id: node.id, type: node.type };
    // Tên hiển thị (label) do người dùng đặt — LƯU thành field `name` để mở lại không
    // mất tên. Chỉ ghi khi khác id (tránh rải field thừa cho node chưa đổi tên).
    if (node.label && node.label !== node.id) out.name = node.label;
    // Trải phẳng data (text/prompt/mode/…) trở lại cấp node. Bỏ 'branches' vì đó là
    // dữ liệu cấu trúc (nhánh tự do), sẽ được dựng lại thành field branches bên dưới.
    for (const [key, value] of Object.entries(node.data)) {
      if (key === 'branches') continue;
      out[key] = value;
    }

    const edges = outgoing(irEdges, node.id);

    // Node nhánh tự do (nexus/logic/jump): xuất branches[]. Riêng logic/jump chỉ dùng
    // branches khi thật sự có nhánh tuỳ biến (ngoài catch-all) — module Script thường
    // chỉ có 1 đường ra thì giữ dạng `next` cho gọn.
    const dataBranches = readDataBranches(node.data);
    const hasCustomBranches =
      [...dataBranches.keys()].some((id) => id !== 'default') ||
      edges.some((e) => (e.sourceHandle ?? 'default') !== 'default');
    const useBranches =
      EDITABLE_BRANCH_TYPES.includes(node.type) && (node.type === 'nexus' || hasCustomBranches);

    if (useBranches) {
      // Giá trị điều kiện lấy TỪ node.data.branches (nguồn sự thật) theo sourceHandle;
      // fallback về edge.condition cho dữ liệu cũ.
      const branches: OutBranch[] = edges.map((e) => {
        const handle = e.sourceHandle ?? 'default';
        const info = dataBranches.get(handle);
        const value = info?.value ?? e.condition ?? '';
        // Nhánh catch-all (handle 'default') LUÔN xuất dạng `default:` để giữ danh
        // tính qua round-trip; value tuỳ biến (MRB cho sửa) ghi kèm ở `when`.
        const out: OutBranch =
          handle === 'default'
            ? { ...(value ? { when: value } : {}), default: e.target }
            : value
              ? { when: value, to: e.target }
              : { default: e.target };
        if (info?.label) out.label = info.label;
        return out;
      });
      if (branches.length > 0) out.branches = branches;
    } else {
      // Node thường: lấy edge default đầu tiên làm next.
      const nextEdge = edges.find((e) => (e.sourceHandle ?? 'default') === 'default') ?? edges[0];
      if (nextEdge) out.next = nextEdge.target;
    }

    outNodes.push(out);
  }

  return { ...(start ? { start } : {}), nodes: outNodes };
}

export function toYaml(ir: FlowIR): string {
  const main = serializeGraph(ir.nodes, ir.edges);

  // Sub Flow: mỗi flow phụ là 1 graph riêng { name, nodes } trong flow.subflows.
  // Sub flow không có node Start nên không có field start.
  const subflows = (ir.subflows ?? []).map((s) => {
    const graph = serializeGraph(s.nodes, s.edges);
    return { name: s.name, nodes: graph.nodes };
  });

  const doc = {
    flow: {
      name: ir.meta.name,
      ...(ir.meta.facility ? { facility: ir.meta.facility } : {}),
      ...(ir.meta.author ? { author: ir.meta.author } : {}),
      ...(ir.meta.createdAt ? { createdAt: ir.meta.createdAt } : {}),
      ...(ir.meta.updatedAt ? { updatedAt: ir.meta.updatedAt } : {}),
      ...(main.start ? { start: main.start } : {}),
      nodes: main.nodes,
      ...(subflows.length > 0 ? { subflows } : {}),
    },
  };

  return stringify(doc, { lineWidth: 0 });
}
