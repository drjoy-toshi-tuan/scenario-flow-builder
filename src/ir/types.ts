// ─────────────────────────────────────────────────────────────────────────────
// IR (Intermediate Representation) — SOURCE OF TRUTH duy nhất mô tả toàn bộ flow.
// YAML và (sau này) .bivr chỉ là adapter import/export quanh model này.
// KHÔNG được import bất cứ thứ gì từ React / React Flow trong file này.
// ─────────────────────────────────────────────────────────────────────────────

export interface FlowIR {
  version: string; // vd "1.0"
  meta: {
    id: string;
    name: string;
    facility?: string; // 施設名 nếu có
    createdAt: string;
    updatedAt: string;
  };
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export type NodeType =
  | 'start'
  | 'announce' // TTS / phát audio
  | 'input' // thu DTMF hoặc STT
  | 'condition' // phân nhánh theo điều kiện (jump)
  | 'script' // ES5 script (Brekeke)
  | 'llm' // gọi OpenAI / LLM
  | 'faq' // hỏi-đáp (FAQ)
  | 'transfer' // chuyển máy
  | 'hangup';

export const NODE_TYPES: readonly NodeType[] = [
  'start',
  'announce',
  'input',
  'condition',
  'script',
  'llm',
  'faq',
  'transfer',
  'hangup',
] as const;

export interface FlowNode {
  id: string;
  type: NodeType;
  label: string;
  position: { x: number; y: number }; // do ELK auto-layout điền; người dùng có thể kéo
  data: Record<string, unknown>; // tham số riêng theo type (vd announce: { text })
}

export interface FlowEdge {
  id: string;
  source: string; // node id
  target: string; // node id
  sourceHandle?: string; // nhánh output: 'default' | 'yes' | 'no' | ...
  condition?: string; // điều kiện jump, hiển thị trên dây
  label?: string;
}

// id dùng cho node "start" tổng hợp (YAML chỉ có field `flow.start`, không có node thật).
export const SYNTHETIC_START_ID = '__start__';
