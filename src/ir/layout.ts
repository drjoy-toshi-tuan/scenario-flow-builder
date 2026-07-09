import ELK, { type ElkNode } from 'elkjs/lib/elk.bundled.js';
import type { FlowIR } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Auto-layout deterministic bằng ELK: điền lại `position` cho mọi node từ IR.
// Hướng top-down (DOWN), thuật toán 'layered' — cho ra sơ đồ dạng cây gọn gàng.
// Hàm thuần (async): nhận IR, trả IR mới với position đã tính, không đụng React.
// ─────────────────────────────────────────────────────────────────────────────

const elk = new ELK();

// Kích thước node THẬT (khớp .bk-node trong index.css) để ELK chừa khoảng cách đúng.
const NODE_WIDTH = 244;
const NODE_HEIGHT = 80;

// Tham số layout CỐ ĐỊNH (deterministic) — cho sơ đồ đều & dễ nhìn:
//   - Khoảng cách trên–dưới (giữa 2 tầng) đồng đều.
//   - Khi rẽ nhánh sang ngang, các node cách nhau khá xa để flow rõ ràng.
const LAYER_SPACING = 96; // trên–dưới giữa các tầng
const NODE_SPACING = 140; // trái–phải giữa các node cùng tầng (rẽ nhánh cách xa)

export async function layout(ir: FlowIR): Promise<FlowIR> {
  if (ir.nodes.length === 0) return ir;

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      // Khoảng cách cố định, đều nhau.
      'elk.layered.spacing.nodeNodeBetweenLayers': `${LAYER_SPACING}`,
      'elk.spacing.nodeNode': `${NODE_SPACING}`,
      'elk.spacing.edgeNode': '40',
      'elk.spacing.edgeEdge': '24',
      // NETWORK_SIMPLEX: kéo thẳng chuỗi mạch chính trên 1 đường dọc, cha căn giữa con.
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      // Cắt vòng lặp (retry) theo DFS từ node gốc (Start): mạch chính đi xuống được
      // giữ nguyên, chỉ dây back-edge (retry) bị đảo -> không đẩy node đích lên tầng trên.
      'elk.layered.cycleBreaking.strategy': 'DEPTH_FIRST',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      // Giữ thứ tự node/nhánh theo input (reserve, change, cancel… trái sang phải).
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.considerModelOrder.components': 'MODEL_ORDER',
      'elk.edgeRouting': 'ORTHOGONAL',
    },
    children: ir.nodes.map((n) => ({
      id: n.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })),
    edges: ir.edges.map((e) => {
      // Dây mạch chính (NEXT / handle 'default') được ưu tiên kéo THẲNG để chuỗi node
      // nối tiếp nằm trên 1 đường dọc; dây nhánh (failed/retry/điều kiện) ưu tiên thấp.
      const isMain = (e.sourceHandle ?? 'default') === 'default';
      return {
        id: e.id,
        sources: [e.source],
        targets: [e.target],
        layoutOptions: {
          'elk.layered.priority.straightness': isMain ? '10' : '1',
        },
      };
    }),
  };

  const laidOut = await elk.layout(graph);

  const positions = new Map<string, { x: number; y: number }>();
  for (const child of laidOut.children ?? []) {
    positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }

  return {
    ...ir,
    nodes: ir.nodes.map((n) => ({
      ...n,
      position: positions.get(n.id) ?? n.position,
    })),
  };
}
