import type { FlowIR, FlowEdge } from './types';
import { SYNTHETIC_START_ID } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Auto-layout deterministic (thuần TypeScript, không phụ thuộc thư viện):
// điền lại `position` cho mọi node từ IR theo phong cách flow chuẩn của dự án:
//
//   1. Mạch chính đi TỪ TRÊN XUỐNG; khoảng cách tầng trên–dưới LUÔN bằng nhau.
//   2. Nhánh `failed` rẽ SANG NGANG: cả chuỗi failed nằm cùng hàng với node
//      nguồn, kéo dần về bên trái (announce → save → hangup…).
//   3. Node phân nhánh (nexus/logic nhiều branch): các nhánh con dàn hàng dưới,
//      cách đều nhau quanh tâm node cha với khoảng cách lớn, KHÔNG chồng chéo
//      (kiểm tra va chạm theo contour từng tầng của cả subtree).
//
// Hàm thuần (async để giữ nguyên chữ ký cũ): nhận IR, trả IR mới với position
// đã tính, không đụng React.
// ─────────────────────────────────────────────────────────────────────────────

// Kích thước node THẬT (khớp .bk-node trong index.css) để chừa khoảng cách đúng.
// Export cho adapter khác dùng chung (toDrawio vẽ node đúng cỡ canvas).
export const NODE_WIDTH = 244;
export const NODE_HEIGHT = 80;

// Tham số layout CỐ ĐỊNH (deterministic):
const LAYER_GAP = 96; // hở trên–dưới giữa 2 tầng
const ROW_STEP = NODE_HEIGHT + LAYER_GAP; // bước tầng = 176, LUÔN bằng nhau
const BRANCH_GAP = 320; // hở ngang tối thiểu giữa 2 nhánh rẽ (mép–mép, cố ý rộng)
const SIDE_GAP = 240; // hở ngang giữa các node trong chuỗi failed nằm ngang (rộng gấp đôi cho thoáng)
const COMPONENT_GAP = 200; // hở giữa các cụm node rời nhau (không nối với nhau)

// Node đặt theo hàng dọc ('down') hay đang trong chuỗi failed nằm ngang ('side').
type Mode = 'down' | 'side';

interface TreeNode {
  id: string;
  down: TreeNode[]; // con xếp ở hàng dưới
  side: TreeNode[]; // con xếp cùng hàng, lấn sang trái (chuỗi failed)
  // Node có edge `failed` đi ra mà target KHÔNG phải con dọc của chính nó (target
  // là side child, đã bị node khác giành, hoặc vòng ngược) -> khi dàn nhánh xuống
  // phải chừa "slot ảo" bên trái cho failed để nhánh giữa thẳng cột dưới cha.
  failedSlot: boolean;
}

// Bao ngang của subtree theo từng tầng (toạ độ mép, tương đối so với TÂM gốc subtree).
type Contour = Map<number, { min: number; max: number }>;

interface Placement {
  id: string;
  dx: number; // tâm node, tương đối so với tâm gốc subtree
  dLayer: number; // tầng, tương đối so với tầng gốc subtree
}

interface SubtreeLayout {
  contour: Contour;
  placements: Placement[];
}

// Dựng cây spanning bằng DFS theo đúng thứ tự edge trong IR (default/next trước,
// rồi failed, rồi các branch — khớp thứ tự nhánh trái→phải người dùng khai báo).
// Edge tới node đã thăm (vòng lặp retry / điểm hội tụ) bị bỏ qua khi tính layout
// — dây vẫn được vẽ bình thường trên canvas.
function buildTree(
  id: string,
  mode: Mode,
  outgoing: Map<string, FlowEdge[]>,
  nonFailedIncoming: Map<string, number>,
  visited: Set<string>,
): TreeNode {
  visited.add(id);
  const node: TreeNode = { id, down: [], side: [], failedSlot: false };
  const edges = outgoing.get(id) ?? [];
  // Đang trong chuỗi ngang mà chỉ có 1 lối ra -> tiếp tục chạy ngang; rẽ nhiều
  // nhánh thì quay về xếp dọc xuống dưới.
  const freshCount = edges.filter((e) => !visited.has(e.target)).length;
  const continueSide = mode === 'side' && freshCount === 1;
  // Target còn NEO vào mạch dọc bằng edge thường (next/branch) từ chỗ khác thì không
  // được kéo sang ngang: node đó giữ chỗ trong mạch dọc, chuỗi failed chỉ vẽ dây tới
  // (vd failed chain merge vào end announce chung / vào 1 nhánh của chính node nguồn).
  const anchoredElsewhere = (edge: FlowEdge): boolean =>
    (nonFailedIncoming.get(edge.target) ?? 0) - (edge.sourceHandle !== 'failed' ? 1 : 0) > 0;
  // Phân loại theo trạng thái visited TẠI THỜI ĐIỂM vào node (giữ nguyên thứ tự khai
  // báo). Edge muốn đi ngang (wantSide) nhưng target bị neo -> BỎ QUA hẳn khi dựng
  // cây (không xếp dọc thay): target sẽ được edge thường của mạch dọc giành sau.
  const classified = edges.map((edge) => {
    const wantSide = continueSide || (mode === 'down' && edge.sourceHandle === 'failed');
    return { edge, wantSide, toSide: wantSide && !anchoredElsewhere(edge) };
  });
  // Giành nhánh NGANG (side/failed) TRƯỚC nhánh dọc: khi 2 node xếp dọc cùng nối tới 1
  // node nằm NGANG bên cạnh, node ngang đó phải nằm cùng hàng với node TRÊN CÙNG (nông
  // nhất) — node nông được duyệt trước nên giành node ngang trước khi con ở dưới kịp
  // giành (nếu duyệt dọc trước, con dưới đi sâu rồi kéo node ngang tụt xuống hàng dưới).
  for (const { edge } of classified.filter((c) => c.toSide)) {
    if (visited.has(edge.target)) continue;
    node.side.push(buildTree(edge.target, 'side', outgoing, nonFailedIncoming, visited));
  }
  for (const { edge } of classified.filter((c) => !c.wantSide)) {
    if (visited.has(edge.target)) continue;
    node.down.push(buildTree(edge.target, 'down', outgoing, nonFailedIncoming, visited));
  }
  const downIds = new Set(node.down.map((child) => child.id));
  node.failedSlot = edges.some(
    (e) => e.sourceHandle === 'failed' && e.target !== id && !downIds.has(e.target),
  );
  return node;
}

// Gộp contour `add` (dịch dx, dLayer) vào `base`.
function mergeContour(base: Contour, add: Contour, dx: number, dLayer: number): void {
  for (const [layer, ext] of add) {
    const targetLayer = layer + dLayer;
    const cur = base.get(targetLayer);
    if (cur) {
      cur.min = Math.min(cur.min, ext.min + dx);
      cur.max = Math.max(cur.max, ext.max + dx);
    } else {
      base.set(targetLayer, { min: ext.min + dx, max: ext.max + dx });
    }
  }
}

// Khoảng cách tâm–tâm tối thiểu để subtree `right` đứng bên phải subtree `left`
// mà không tầng nào chạm nhau (chừa hở `gap`).
function minSeparation(left: Contour, right: Contour, gap: number): number {
  let sep = 0;
  for (const [layer, extLeft] of left) {
    const extRight = right.get(layer);
    if (extRight) sep = Math.max(sep, extLeft.max - extRight.min + gap);
  }
  return sep;
}

// Xếp 1 subtree (đệ quy, bottom-up). Toạ độ trả về tương đối so với tâm gốc.
function layoutSubtree(tree: TreeNode): SubtreeLayout {
  const contour: Contour = new Map([[0, { min: -NODE_WIDTH / 2, max: NODE_WIDTH / 2 }]]);
  const placements: Placement[] = [{ id: tree.id, dx: 0, dLayer: 0 }];

  // 1) Con xếp DỌC: dàn hàng dưới, cách ĐỀU nhau quanh tâm node cha.
  //    Bước ngang chung = lớn nhất trong các khoảng cách cần thiết giữa MỌI cặp
  //    nhánh (chia theo số bước giữa chúng) -> đều nhau mà vẫn không chồng chéo.
  if (tree.down.length > 0) {
    const subs = tree.down.map(layoutSubtree);
    let step = 0;
    if (subs.length > 1) {
      step = NODE_WIDTH + BRANCH_GAP;
      for (let i = 0; i < subs.length; i++) {
        for (let j = i + 1; j < subs.length; j++) {
          step = Math.max(step, minSeparation(subs[i].contour, subs[j].contour, BRANCH_GAP) / (j - i));
        }
      }
    }
    const mid = (subs.length - 1) / 2;
    // Node có failed đi NGANG-TRÁI + số nhánh xuống CHẴN: chừa 1 "slot ảo" bên trái
    // cho failed rồi đẩy các nhánh xuống sang phải NỬA BƯỚC. Nhờ vậy nhánh GIỮA (tính
    // cả failed) thẳng cột dưới node cha (vd failed + 2 nhánh -> nhánh đầu thẳng).
    // Số nhánh xuống LẺ vốn đã có nhánh giữa thẳng -> không dịch (giữ interaction
    // failed+next 1 nhánh thẳng như cũ). Dựa vào failedSlot (CÓ edge failed rời node,
    // kể cả khi target đã bị node khác giành — vd announce retry dùng chung) chứ không
    // phải side.length, để node nào có failed cũng thẳng cột như nhau; node rẽ nhánh
    // thường (không failed) không bị đụng.
    const failedSlotShift = tree.failedSlot && subs.length % 2 === 0 ? step / 2 : 0;
    subs.forEach((sub, index) => {
      const dx = (index - mid) * step + failedSlotShift; // đối xứng qua tâm cha (+ bù slot failed)
      for (const p of sub.placements) {
        placements.push({ id: p.id, dx: p.dx + dx, dLayer: p.dLayer + 1 });
      }
      mergeContour(contour, sub.contour, dx, 1);
    });
  }

  // 2) Chuỗi FAILED nằm NGANG: cùng hàng với node nguồn, lấn dần sang trái.
  //    Dịch trái vừa đủ để không chạm phần đã xếp (kể cả các subtree treo dưới
  //    chuỗi), tối thiểu lùi đúng 1 bước ngang.
  for (const side of tree.side) {
    const sub = layoutSubtree(side);
    let dx = -(NODE_WIDTH + SIDE_GAP);
    for (const [layer, ext] of sub.contour) {
      const cur = contour.get(layer);
      if (cur) dx = Math.min(dx, cur.min - SIDE_GAP - ext.max);
    }
    for (const p of sub.placements) {
      placements.push({ id: p.id, dx: p.dx + dx, dLayer: p.dLayer });
    }
    mergeContour(contour, sub.contour, dx, 0);
  }

  return { contour, placements };
}

export async function layout(ir: FlowIR): Promise<FlowIR> {
  if (ir.nodes.length === 0) return ir;

  const nodeIds = new Set(ir.nodes.map((n) => n.id));
  const outgoing = new Map<string, FlowEdge[]>();
  const hasIncoming = new Set<string>();
  // Số edge thường (next/branch, KHÔNG phải failed) trỏ VÀO từng node — node có neo
  // dọc như vậy không được chuỗi failed kéo sang ngang (xem anchoredElsewhere).
  const nonFailedIncoming = new Map<string, number>();
  for (const edge of ir.edges) {
    // Bỏ edge treo (node không tồn tại) và self-loop khỏi tính toán layout.
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    if (edge.source === edge.target) continue;
    const list = outgoing.get(edge.source);
    if (list) list.push(edge);
    else outgoing.set(edge.source, [edge]);
    hasIncoming.add(edge.target);
    if (edge.sourceHandle !== 'failed') {
      nonFailedIncoming.set(edge.target, (nonFailedIncoming.get(edge.target) ?? 0) + 1);
    }
  }

  // Thứ tự chọn gốc cây: node Start tổng hợp -> node không có dây vào -> phần còn
  // lại (cụm toàn vòng lặp), giữ nguyên thứ tự khai báo trong IR.
  const rootCandidates = [
    ...ir.nodes.filter((n) => n.id === SYNTHETIC_START_ID),
    ...ir.nodes.filter((n) => n.id !== SYNTHETIC_START_ID && !hasIncoming.has(n.id)),
    ...ir.nodes.filter((n) => n.id !== SYNTHETIC_START_ID && hasIncoming.has(n.id)),
  ];

  const visited = new Set<string>();
  const positions = new Map<string, { x: number; y: number }>();
  let offsetX = 0; // mép trái dành cho cụm (component) tiếp theo
  for (const candidate of rootCandidates) {
    if (visited.has(candidate.id)) continue;
    const tree = buildTree(candidate.id, 'down', outgoing, nonFailedIncoming, visited);
    const sub = layoutSubtree(tree);

    let minX = Infinity;
    let maxX = -Infinity;
    for (const ext of sub.contour.values()) {
      minX = Math.min(minX, ext.min);
      maxX = Math.max(maxX, ext.max);
    }
    const shift = offsetX - minX; // đẩy cả cụm sao cho mép trái chạm offsetX
    for (const p of sub.placements) {
      // Placement giữ TÂM node; position của IR là góc trên–trái.
      positions.set(p.id, { x: p.dx + shift - NODE_WIDTH / 2, y: p.dLayer * ROW_STEP });
    }
    offsetX = shift + maxX + COMPONENT_GAP;
  }

  return {
    ...ir,
    nodes: ir.nodes.map((n) => ({
      ...n,
      position: positions.get(n.id) ?? n.position,
    })),
  };
}
