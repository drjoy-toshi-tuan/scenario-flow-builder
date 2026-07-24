import type { FlowIR, FlowNode, FlowEdge } from '../ir/types';
import { validateFlow } from '../ir/validate';
import { sourceHandlesFor, logicModuleOf, requiredHandleIds } from '../ui/nodeSchema';

// ─────────────────────────────────────────────────────────────────────────────
// "Flow digest" — biểu diễn GỌN của TOÀN BỘ kịch bản (main + mọi sub flow) cho AI.
// FLOW ĐANG MỞ digest ĐẦY ĐỦ (node + brief + handle ra + dây); các FLOW KHÁC chỉ
// liệt kê node để AI BIẾT node tồn tại ở đâu (không bung chi tiết).
//
// TS phức tạp (node có MODULE + nhiều property, nhánh sinh từ property) nên ở mode
// TS mỗi node kèm: module đang dùng + các property đã đặt. Handle ra luôn hiện (mọi
// mode) để AI biết CHÍNH XÁC nhánh nào phải nối. Validator dùng resolver
// requiredHandleIds (module-aware) thay vì luật thô.
//
// Hàm THUẦN (không React). Nhận "doc" đầy đủ (assembleDoc) + activeFlowId + cs.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_TEXT = 120;

function clip(v: string): string {
  const s = v.replace(/\s+/g, ' ').trim();
  return s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}…` : s;
}

// null = loại không có field văn bản chính (không hiện ::); '' = có nhưng TRỐNG
// (hiện "(empty)"); chuỗi = nội dung.
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
      return null;
  }
}

// Handle ra của node (bỏ qua nếu tầm thường = chỉ mỗi 'default', hoặc không có).
function handlesStr(n: FlowNode, cs: boolean): string {
  const ids = sourceHandlesFor(n, cs).map((h) => h.id);
  if (ids.length === 0) return '';
  if (ids.length === 1 && ids[0] === 'default') return '';
  return ` handles:[${ids.join(', ')}]`;
}

// TS: module đang dùng + property đã đặt (bỏ field nhiễu/đã hiện ở brief). Giúp AI
// hiểu schema node phức tạp (classifier/normalization/CMR…) để sửa đúng.
const NOISE_KEYS = new Set([
  'branches',
  'description',
  'text',
  'announce',
  'prompt',
  'script',
  'moduleType',
  'position',
]);
function tsDetailStr(n: FlowNode): string {
  const d = n.data ?? {};
  let out = '';
  if (n.type === 'logic' || n.type === 'classifier' || n.type === 'normalization') {
    out += ` module=${logicModuleOf(d)}`;
  }
  const props: string[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (NOISE_KEYS.has(k) || v == null || v === '') continue;
    if (typeof v === 'object') props.push(`${k}=[…]`);
    else props.push(`${k}=${clip(String(v))}`);
    if (props.length >= 10) break;
  }
  if (props.length) out += ` props{${props.join('; ')}}`;
  return out;
}

// 1 dòng node. detail=true (flow đang mở): kèm handle + (TS) module/property.
function nodeLine(n: FlowNode, cs: boolean, detail: boolean): string {
  const pt = primaryText(n);
  const brief = pt === null ? '' : pt === '' ? ' :: (empty)' : ` :: ${clip(pt)}`;
  if (!detail) return `- ${n.id} [${n.type}] "${n.label}"${brief}`;
  const extra = cs ? '' : tsDetailStr(n);
  return `- ${n.id} [${n.type}] "${n.label}"${brief}${handlesStr(n, cs)}${extra}`;
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

function allFlows(doc: FlowIR): FlowGraph[] {
  return [
    { id: 'main', name: 'Main Flow', nodes: doc.nodes, edges: doc.edges },
    ...(doc.subflows ?? []).map((s) => ({ id: s.id, name: s.name, nodes: s.nodes, edges: s.edges })),
  ];
}

// Digest toàn kịch bản. doc: assembleDoc; activeFlowId: flow đang mở; cs: mode CS?
export function buildFlowDigest(doc: FlowIR, activeFlowId: string, cs = false): string {
  const flows = allFlows(doc);
  const open = flows.find((f) => f.id === activeFlowId) ?? flows[0];
  const others = flows.filter((f) => f !== open);

  const out: string[] = [];
  out.push(`SCENARIO: ${doc.meta.name}${doc.meta.facility ? ` (facility: ${doc.meta.facility})` : ''}`);
  out.push(`OPEN FLOW: ${open.name}`);
  out.push(`ALL FLOWS: ${flows.map((f) => f.name).join(', ')}`);
  out.push('');

  out.push(`OPEN FLOW "${open.name}" — NODES:`);
  for (const n of open.nodes) out.push(nodeLine(n, cs, true));
  out.push('EDGES:');
  if (open.edges.length === 0) out.push('- (none)');
  for (const e of open.edges) out.push(edgeLine(e));

  // Cảnh báo nối dây thiếu — resolver module-aware (chính xác cho node TS).
  const violations = validateFlow(open.nodes, open.edges, (n) => requiredHandleIds(n, cs));
  if (violations.length) {
    out.push('');
    out.push('INCOMPLETE WIRING (open flow) — every handle below MUST be connected with add_edge:');
    for (const v of violations) {
      out.push(`- ${v.nodeId} [${v.nodeType}] "${v.nodeLabel}" is missing an edge for handle: ${v.handle}`);
    }
  }

  if (others.length) {
    out.push('');
    out.push('OTHER FLOWS (read-only here — to edit a node in one, tell the user to open that flow first):');
    for (const f of others) {
      out.push(`FLOW "${f.name}":`);
      for (const n of f.nodes) out.push(nodeLine(n, cs, false));
    }
  }
  return out.join('\n');
}
