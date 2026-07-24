import type { FlowIR, FlowNode, FlowEdge } from '../ir/types';
import { validateFlow } from '../ir/validate';

// ─────────────────────────────────────────────────────────────────────────────
// "Flow digest" — biểu diễn GỌN của TOÀN BỘ kịch bản (main + mọi sub flow) để gửi
// cho AI. Trước đây chỉ digest flow đang mở nên AI "mù" các node ở sub flow khác
// (vd 聴取失敗 nằm ở sub flow không mở -> AI tưởng không có, không xử lý được).
//
// Chiến lược token: FLOW ĐANG MỞ digest ĐẦY ĐỦ (node + brief + dây) vì đó là thứ
// AI được sửa; các FLOW KHÁC chỉ liệt kê node (id · type · label · trạng thái điền)
// để AI BIẾT node tồn tại ở đâu và chỉ người dùng mở đúng flow — KHÔNG bung dây.
//
// Hàm THUẦN (không React). Nhận "doc" đầy đủ (từ assembleDoc) + activeFlowId.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_TEXT = 120; // cắt bớt announce/prompt/script dài cho gọn token

function clip(v: string): string {
  const s = v.replace(/\s+/g, ' ').trim();
  return s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}…` : s;
}

// Nội dung "chính" của 1 node theo loại:
//   null  = loại node KHÔNG có field văn bản chính (nexus/save/hangup/start) -> không hiện ::
//   ''    = CÓ field nhưng đang TRỐNG -> hiện "(empty)" (tín hiệu để AI điền)
//   chuỗi = nội dung (đã clip)
function primaryText(n: FlowNode): string | null {
  const d = n.data ?? {};
  const str = (v: unknown): string => (typeof v === 'string' ? v : '');
  switch (n.type) {
    case 'announce':
      return str(d.text);
    case 'interaction':
      return str(d.announce);
    case 'openai':
      return str(d.prompt);
    case 'logic':
    case 'classifier':
    case 'normalization':
      return str(d.moduleType || d.script || d.description);
    case 'jump':
      return typeof d.subflow === 'string' && d.subflow ? `→ ${d.subflow}` : '';
    case 'transfer':
      return str(d.number || d.destination);
    default:
      return null; // nexus / save / hangup / start
  }
}

function nodeLine(n: FlowNode): string {
  const pt = primaryText(n);
  const brief = pt === null ? '' : pt === '' ? ' :: (empty)' : ` :: ${clip(pt)}`;
  return `- ${n.id} [${n.type}] "${n.label}"${brief}`;
}

function edgeLine(e: FlowEdge): string {
  const parts: string[] = [];
  if (e.sourceHandle) parts.push(`handle=${e.sourceHandle}`);
  if (e.condition) parts.push(`cond=${clip(e.condition)}`);
  const meta = parts.length ? ` (${parts.join(', ')})` : '';
  return `- ${e.source} -> ${e.target}${meta}`;
}

interface FlowGraph {
  id: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// Gom main + tất cả sub flow thành danh sách phẳng (doc = kết quả assembleDoc).
function allFlows(doc: FlowIR): FlowGraph[] {
  return [
    { id: 'main', name: 'Main Flow', nodes: doc.nodes, edges: doc.edges },
    ...(doc.subflows ?? []).map((s) => ({ id: s.id, name: s.name, nodes: s.nodes, edges: s.edges })),
  ];
}

// Digest toàn kịch bản. doc: tài liệu đầy đủ (assembleDoc); activeFlowId: flow đang mở.
export function buildFlowDigest(doc: FlowIR, activeFlowId: string): string {
  const flows = allFlows(doc);
  const open = flows.find((f) => f.id === activeFlowId) ?? flows[0];
  const others = flows.filter((f) => f !== open);

  const out: string[] = [];
  out.push(`SCENARIO: ${doc.meta.name}${doc.meta.facility ? ` (facility: ${doc.meta.facility})` : ''}`);
  out.push(`OPEN FLOW: ${open.name}`);
  out.push(`ALL FLOWS: ${flows.map((f) => f.name).join(', ')}`);
  out.push('');

  // Flow đang mở — đầy đủ (đây là flow AI được sửa).
  out.push(`OPEN FLOW "${open.name}" — NODES:`);
  for (const n of open.nodes) out.push(nodeLine(n));
  out.push('EDGES:');
  if (open.edges.length === 0) out.push('- (none)');
  for (const e of open.edges) out.push(edgeLine(e));

  // Cảnh báo nối dây thiếu (bất biến: mỗi node nối đủ handle ra bắt buộc). Giúp AI
  // biết CHÍNH XÁC chỗ nào còn hở dây (vd interaction thiếu nhánh failed) để vá.
  const violations = validateFlow(open.nodes, open.edges);
  if (violations.length) {
    out.push('');
    out.push('INCOMPLETE WIRING (open flow) — every handle below MUST be connected with add_edge:');
    for (const v of violations) {
      out.push(`- ${v.nodeId} [${v.nodeType}] "${v.nodeLabel}" is missing an edge for handle: ${v.handle}`);
    }
  }

  // Các flow khác — chỉ liệt kê node để AI biết chúng tồn tại. Muốn sửa phải mở flow đó.
  if (others.length) {
    out.push('');
    out.push('OTHER FLOWS (read-only here — to edit a node in one, tell the user to open that flow first):');
    for (const f of others) {
      out.push(`FLOW "${f.name}":`);
      for (const n of f.nodes) out.push(nodeLine(n));
    }
  }
  return out.join('\n');
}
