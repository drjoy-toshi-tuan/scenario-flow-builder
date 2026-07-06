import { stringify } from 'yaml';
import { type FlowIR, type FlowEdge, SYNTHETIC_START_ID } from './types';

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

export function toYaml(ir: FlowIR): string {
  // Điểm bắt đầu = target của edge đi ra từ node 'start' tổng hợp (nếu có).
  const startEdge = ir.edges.find((e) => e.source === SYNTHETIC_START_ID);
  const start = startEdge?.target;

  const outNodes: OutNode[] = [];

  for (const node of ir.nodes) {
    if (node.id === SYNTHETIC_START_ID) continue; // start là field, không phải node YAML

    const out: OutNode = { id: node.id, type: node.type };
    // Trải phẳng data (text/prompt/mode/…) trở lại cấp node. Bỏ 'branches' vì đó là
    // dữ liệu cấu trúc (nhánh tự do), sẽ được dựng lại thành field branches bên dưới.
    for (const [key, value] of Object.entries(node.data)) {
      if (key === 'branches') continue;
      out[key] = value;
    }

    const edges = outgoing(ir.edges, node.id);

    if (node.type === 'condition') {
      // Giá trị điều kiện lấy TỪ node.data.branches (nguồn sự thật) theo sourceHandle;
      // fallback về edge.condition cho dữ liệu cũ.
      const dataBranches = readDataBranches(node.data);
      const branches: OutBranch[] = edges.map((e) => {
        const handle = e.sourceHandle ?? 'default';
        const info = dataBranches.get(handle);
        const value = info?.value ?? e.condition ?? '';
        const out: OutBranch = value ? { when: value, to: e.target } : { default: e.target };
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

  const doc = {
    flow: {
      name: ir.meta.name,
      ...(ir.meta.facility ? { facility: ir.meta.facility } : {}),
      ...(start ? { start } : {}),
      nodes: outNodes,
    },
  };

  return stringify(doc, { lineWidth: 0 });
}
