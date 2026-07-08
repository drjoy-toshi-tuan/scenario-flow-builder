import type { FlowIR, FlowNode, FlowEdge } from '../ir/types';
import { BREKEKE_SCRIPT_KNOWLEDGE, OPENAI_PROMPT_KNOWLEDGE } from './knowledge';

// ─────────────────────────────────────────────────────────────────────────────
// Dựng NGỮ CẢNH cho AI (hàm thuần, không React):
//   - Tìm node "câu hỏi" (announce/interaction) nối tới node logic/openai đang
//     sửa — trực tiếp hoặc gián tiếp qua các node nexus.
//   - Liệt kê ứng viên announce/interaction trên TOÀN tài liệu (main + sub flow)
//     cho bộ chọn node trong modal.
//   - Dựng system prompt: role + knowledge + YAML + câu hỏi + code/prompt hiện có.
// ─────────────────────────────────────────────────────────────────────────────

export type GenerateKind = 'script' | 'prompt';

export interface QuestionCandidate {
  id: string;
  label: string;
  announce: string; // nội dung announce của node (data.text / data.announce)
  flowName: string; // 'Main Flow' hoặc tên sub flow — hiển thị trong bộ chọn
}

interface Graph {
  nodes: FlowNode[];
  edges: FlowEdge[];
  flowName: string;
}

// Các graph trong tài liệu: main + mọi sub flow.
function graphsOf(doc: FlowIR): Graph[] {
  return [
    { nodes: doc.nodes, edges: doc.edges, flowName: 'Main Flow' },
    ...(doc.subflows ?? []).map((s) => ({ nodes: s.nodes, edges: s.edges, flowName: s.name })),
  ];
}

// Nội dung announce của 1 node: announce dùng data.text, interaction dùng data.announce.
export function announceTextOf(node: FlowNode): string {
  const v = node.type === 'announce' ? node.data.text : node.data.announce;
  return typeof v === 'string' ? v : '';
}

// Toàn bộ node announce/interaction trong tài liệu (ứng viên cho bộ chọn).
export function questionCandidates(doc: FlowIR | null): QuestionCandidate[] {
  if (!doc) return [];
  const out: QuestionCandidate[] = [];
  for (const g of graphsOf(doc)) {
    for (const n of g.nodes) {
      if (n.type !== 'announce' && n.type !== 'interaction') continue;
      out.push({
        id: n.id,
        label: n.label.trim() || n.id,
        announce: announceTextOf(n),
        flowName: g.flowName,
      });
    }
  }
  return out;
}

// Tự tìm node câu hỏi cho node đích: đi NGƯỢC các dây tới (BFS) trong graph chứa
// node; gặp announce/interaction thì nhận; gặp nexus thì đi tiếp qua nó.
export function detectQuestionNodeId(doc: FlowIR | null, targetId: string): string | null {
  if (!doc) return null;
  const graph = graphsOf(doc).find((g) => g.nodes.some((n) => n.id === targetId));
  if (!graph) return null;
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  const visited = new Set<string>([targetId]);
  let frontier = [targetId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of graph.edges) {
        if (e.target !== id || visited.has(e.source)) continue;
        visited.add(e.source);
        const src = byId.get(e.source);
        if (!src) continue;
        if (src.type === 'announce' || src.type === 'interaction') return src.id;
        if (src.type === 'nexus') next.push(src.id); // đi xuyên qua nexus
      }
    }
    frontier = next;
  }
  return null;
}

// ── System prompt cho "AIで生成・修正" ──────────────────────────────────────
export interface GenerateContext {
  yaml: string; // toàn bộ YAML hiện tại (context chung)
  questionAnnounce: string; // câu hỏi (announce) làm bối cảnh chính
  current: string; // code/prompt hiện có (rỗng nếu chưa có)
}

export function buildGenerateSystemPrompt(kind: GenerateKind, ctx: GenerateContext): string {
  const role =
    kind === 'script'
      ? `Bạn là kỹ sư IVR chuyên viết script JavaScript cho node Logic (module Script) của hệ thống AI電話 (Brekeke-based).
Nhiệm vụ: sinh hoặc chỉnh sửa script phân tích câu trả lời của người gọi cho câu hỏi bên dưới.
${BREKEKE_SCRIPT_KNOWLEDGE}`
      : `Bạn là chuyên gia prompt engineering cho node OpenAI của hệ thống AI電話 (Brekeke-based).
Nhiệm vụ: sinh hoặc chỉnh sửa PROMPT (văn bản) mà node OpenAI dùng để phân tích câu trả lời của người gọi cho câu hỏi bên dưới.
${OPENAI_PROMPT_KNOWLEDGE}`;

  const sections = [role];

  sections.push(`## Câu hỏi (announce) — bối cảnh chính
Đây là câu hỏi hệ thống đọc cho người gọi ngay trước node này; người gọi sẽ trả lời câu này:
"""
${ctx.questionAnnounce || '(không có — hãy suy ra từ YAML)'}
"""`);

  sections.push(`## Toàn bộ YAML của flow hiện tại (context chung — chỉ để hiểu, KHÔNG chỉnh sửa YAML)
"""yaml
${ctx.yaml}
"""`);

  if (ctx.current.trim()) {
    sections.push(
      kind === 'script'
        ? `## Script hiện tại (cần CHỈNH SỬA — chỉ sửa đúng phần người dùng yêu cầu, giữ nguyên phần còn lại)
"""js
${ctx.current}
"""`
        : `## Prompt hiện tại (cần CHỈNH SỬA — chỉ sửa đúng phần người dùng yêu cầu, giữ nguyên phần còn lại)
"""
${ctx.current}
"""`,
    );
  }

  sections.push(
    kind === 'script'
      ? `## Yêu cầu output
Chỉ trả về NỘI DUNG SCRIPT hoàn chỉnh (JavaScript thuần), KHÔNG kèm markdown, KHÔNG kèm giải thích.`
      : `## Yêu cầu output
Chỉ trả về NỘI DUNG PROMPT hoàn chỉnh (văn bản thuần), KHÔNG kèm markdown, KHÔNG kèm giải thích.`,
  );

  return sections.join('\n\n');
}

// ── Prompt cho phần GIẢI THÍCH code (info panel) ────────────────────────────
export function buildExplainMessages(script: string, lang: 'vi' | 'ja') {
  const language = lang === 'ja' ? '日本語' : 'tiếng Việt';
  return [
    {
      role: 'system' as const,
      content: `Bạn là kỹ sư IVR đọc hiểu script JavaScript của node Logic trong hệ thống AI電話 (Brekeke-based).
Giá trị script \`return\` sẽ được so khớp với các nhánh regex của node để rẽ nhánh.
Hãy giải thích NGẮN GỌN (bằng ${language}): (1) script này làm gì, (2) output/return có thể là những giá trị nào và ý nghĩa từng giá trị.
Chỉ trả về phần giải thích thuần văn bản (có thể gạch đầu dòng), không markdown code fence.`,
    },
    {
      role: 'user' as const,
      content: `"""js\n${script}\n"""`,
    },
  ];
}
