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

export interface LayoutOpts {
  // Màn CS: bố cục "thoáng" kiểu bản thiết kế PDF — nhánh hợp lưu (merge) CHÌM xuống
  // DƯỚI mọi nhánh nuôi nó rồi CĂN GIỮA, để phần đuôi chung thành 1 cột dọc ở giữa
  // (thay vì bám cột của nhánh đầu tiên chạm tới). Xem airifyCs().
  cs?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Post-pass CHỈ cho màn CS: nắn bố cục cây cho "thoáng" giống bản thiết kế PDF.
//   - Y theo LONGEST-PATH depth: node hợp lưu (nhiều nhánh chảy vào) chìm xuống dưới
//     TẦNG SÂU NHẤT trong các nhánh nuôi nó -> đuôi chung (質問→…→終話) nằm hẳn dưới
//     mọi nhánh, đọc như 1 cột dọc, không bị kéo lên ngang hàng nửa chừng.
//   - X: giữ vị trí fan của cây cho phần nhánh; riêng node MERGE (≥2 nhánh cha) được
//     căn GIỮA theo tâm các node cha, kéo theo cả đuôi phía dưới (đuôi nằm dưới mọi
//     nhánh nên dịch ngang không đụng nhánh nào).
// Cạnh vòng ngược (retry/loop) bị loại khỏi tính rank (như buildTree).
// ─────────────────────────────────────────────────────────────────────────────
function airifyCs(laid: FlowIR, rawEdges: FlowEdge[]): FlowIR {
  const nodeIds = new Set(laid.nodes.map((n) => n.id));
  const key = (s: string, t: string) => `${s} ${t}`;
  // Cạnh forward duy nhất (bỏ self-loop, node treo, và edge trùng source→target vd
  // next+failed cùng đích -> KHÔNG tính là 2 nhánh cha).
  const seenPair = new Set<string>();
  const edges: FlowEdge[] = [];
  for (const e of rawEdges) {
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target) || e.source === e.target) continue;
    const k = key(e.source, e.target);
    if (seenPair.has(k)) continue;
    seenPair.add(k);
    edges.push(e);
  }
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) adj.set(id, []);
  for (const e of edges) adj.get(e.source)!.push(e.target);

  // Back-edge (vòng lặp) = cạnh trỏ tới node đang nằm trên stack DFS. Thứ tự gốc như
  // buildTree: Start tổng hợp -> node không có dây vào -> phần còn lại.
  const hasIncoming = new Set(edges.map((e) => e.target));
  const rootOrder = [
    ...laid.nodes.filter((n) => n.id === SYNTHETIC_START_ID),
    ...laid.nodes.filter((n) => n.id !== SYNTHETIC_START_ID && !hasIncoming.has(n.id)),
    ...laid.nodes.filter((n) => n.id !== SYNTHETIC_START_ID && hasIncoming.has(n.id)),
  ].map((n) => n.id);
  const dfsState = new Map<string, number>(); // 0/undef=chưa, 1=trên stack, 2=xong
  const backEdges = new Set<string>();
  const visit = (u: string) => {
    dfsState.set(u, 1);
    for (const v of adj.get(u)!) {
      const st = dfsState.get(v) ?? 0;
      if (st === 1) backEdges.add(key(u, v));
      else if (st === 0) visit(v);
    }
    dfsState.set(u, 2);
  };
  for (const r of rootOrder) if ((dfsState.get(r) ?? 0) === 0) visit(r);

  // DAG forward (bỏ back edge).
  const fout = new Map<string, string[]>();
  const fpreds = new Map<string, string[]>();
  for (const id of nodeIds) {
    fout.set(id, []);
    fpreds.set(id, []);
  }
  for (const e of edges) {
    if (backEdges.has(key(e.source, e.target))) continue;
    fout.get(e.source)!.push(e.target);
    fpreds.get(e.target)!.push(e.source);
  }

  // Longest-path depth (topo Kahn trên DAG forward).
  const indeg = new Map<string, number>();
  for (const id of nodeIds) indeg.set(id, fpreds.get(id)!.length);
  const depth = new Map<string, number>();
  const queue: string[] = [];
  for (const id of nodeIds)
    if (indeg.get(id) === 0) {
      queue.push(id);
      depth.set(id, 0);
    }
  const topo: string[] = [];
  while (queue.length) {
    const u = queue.shift()!;
    topo.push(u);
    for (const v of fout.get(u)!) {
      depth.set(v, Math.max(depth.get(v) ?? 0, (depth.get(u) ?? 0) + 1));
      indeg.set(v, indeg.get(v)! - 1);
      if (indeg.get(v) === 0) queue.push(v);
    }
  }

  // Toạ độ mới: X giữ từ cây; Y = longest-path depth.
  const pos = new Map<string, { x: number; y: number }>();
  for (const n of laid.nodes)
    pos.set(n.id, { x: n.position.x, y: (depth.get(n.id) ?? 0) * ROW_STEP });

  // Con cháu forward của 1 node (để dịch cả đuôi khi căn giữa merge).
  const descendants = (start: string): Set<string> => {
    const seen = new Set<string>([start]);
    const stack = [start];
    while (stack.length) {
      const u = stack.pop()!;
      for (const v of fout.get(u)!)
        if (!seen.has(v)) {
          seen.add(v);
          stack.push(v);
        }
    }
    return seen;
  };
  // Căn giữa các node MERGE theo tâm cha, xử lý từ NÔNG tới SÂU (cha trước con).
  for (const m of topo) {
    const preds = fpreds.get(m)!;
    if (preds.length < 2) continue;
    const meanX = preds.reduce((s, p) => s + pos.get(p)!.x, 0) / preds.length;
    const delta = meanX - pos.get(m)!.x;
    if (Math.abs(delta) < 1) continue;
    for (const id of descendants(m)) {
      const p = pos.get(id)!;
      pos.set(id, { x: p.x + delta, y: p.y });
    }
  }

  // Tách các node CÙNG TẦNG (cùng Y) để KHÔNG đè nhau: sau khi chìm merge + căn giữa,
  // vài node (nhất là terminal) có thể rơi vào cùng tầng ở cùng vùng X. Sort theo X,
  // đẩy phải cho đủ khe, rồi dịch cả tầng lại để GIỮ TÂM (không lệch hẳn 1 phía).
  const SEP = NODE_WIDTH + 56; // khoảng cách tâm–tâm tối thiểu trong 1 tầng
  const byLayer = new Map<number, string[]>();
  for (const [id, p] of pos) {
    const layer = Math.round(p.y / ROW_STEP);
    const list = byLayer.get(layer);
    if (list) list.push(id);
    else byLayer.set(layer, [id]);
  }
  for (const ids of byLayer.values()) {
    if (ids.length < 2) continue;
    ids.sort((a, b) => pos.get(a)!.x - pos.get(b)!.x);
    const before = ids.reduce((s, id) => s + pos.get(id)!.x, 0) / ids.length;
    for (let i = 1; i < ids.length; i++) {
      const prev = pos.get(ids[i - 1])!.x;
      const cur = pos.get(ids[i])!;
      if (cur.x < prev + SEP) pos.set(ids[i], { x: prev + SEP, y: cur.y });
    }
    const after = ids.reduce((s, id) => s + pos.get(id)!.x, 0) / ids.length;
    const shift = before - after; // giữ tâm tầng như trước khi đẩy
    if (Math.abs(shift) >= 1) for (const id of ids) {
      const p = pos.get(id)!;
      pos.set(id, { x: p.x + shift, y: p.y });
    }
  }

  return {
    ...laid,
    nodes: laid.nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position })),
  };
}

export async function layout(ir: FlowIR, opts?: LayoutOpts): Promise<FlowIR> {
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

  const laid: FlowIR = {
    ...ir,
    nodes: ir.nodes.map((n) => ({
      ...n,
      position: positions.get(n.id) ?? n.position,
    })),
  };

  // Màn CS: nắn thêm cho "thoáng" kiểu PDF (merge chìm xuống dưới + căn giữa).
  return opts?.cs ? airifyCs(laid, ir.edges) : laid;
}
