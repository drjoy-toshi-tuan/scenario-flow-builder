// ─────────────────────────────────────────────────────────────────────────────
// IR (Intermediate Representation) — SOURCE OF TRUTH duy nhất mô tả toàn bộ flow.
// YAML và (sau này) .bivr chỉ là adapter import/export quanh model này.
// KHÔNG được import bất cứ thứ gì từ React / React Flow trong file này.
// ─────────────────────────────────────────────────────────────────────────────

export interface FlowIR {
  version: string; // vd "1.0"
  meta: {
    id: string;
    name: string; // シナリオ名 (tên kịch bản)
    facility?: string; // 施設名 (tên bệnh viện) nếu có
    author?: string; // 作成者 (người tạo) nếu có
    createdAt: string; // 作成日時 — định dạng yyyy-MM-dd HH:mm
    updatedAt: string; // 更新日時 — định dạng yyyy-MM-dd HH:mm
  };
  // Main Flow: graph chính của file (flow.nodes trong YAML).
  nodes: FlowNode[];
  edges: FlowEdge[];
  // Sub Flow: các flow phụ trong cùng file, node Jump trỏ tới theo TÊN. Xử lý tới
  // node cuối (không nối tiếp) của sub flow thì quay lại main flow (logic Brekeke).
  subflows?: SubFlow[];
}

export interface SubFlow {
  id: string; // slug duy nhất trong file (suy từ tên)
  name: string; // tên hiển thị — node Jump tham chiếu theo tên này
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export type NodeType =
  | 'start'
  | 'announce' // TTS / phát audio
  | 'interaction' // thu DTMF hoặc STT (tên cũ: input)
  | 'nexus' // phân nhánh theo điều kiện (tên cũ: condition)
  | 'logic' // module logic / script (tên cũ: script)
  | 'openai' // gọi OpenAI / LLM (tên cũ: llm)
  | 'faq' // hỏi-đáp (FAQ)
  | 'transfer' // chuyển máy
  | 'save' // lưu dữ liệu — module Flag (ステータスフラグ / SMSフラグ) hoặc Save Data 2 Dr.JOY
  | 'jump' // nhảy sang sub flow khác
  | 'hangup';

export const NODE_TYPES: readonly NodeType[] = [
  'start',
  'announce',
  'interaction',
  'nexus',
  'logic',
  'openai',
  'faq',
  'transfer',
  'save',
  'jump',
  'hangup',
] as const;

// Tên type cũ trong YAML -> tên mới (đổi tên hệ thống nhưng file cũ vẫn mở được).
export const LEGACY_TYPE_ALIASES: Record<string, NodeType> = {
  input: 'interaction',
  condition: 'nexus',
  script: 'logic',
  llm: 'openai',
  flag: 'save',
};

// Loại node có nhánh TỰ DO (data.branches) — dùng chung cho fromYaml/toYaml/nodeSchema
// để 3 nơi không lệch nhau khi thêm loại node mới.
export const EDITABLE_BRANCH_TYPES: readonly NodeType[] = ['nexus', 'logic', 'jump'] as const;

export interface FlowNode {
  id: string;
  type: NodeType;
  label: string;
  position: { x: number; y: number }; // do auto-layout (ir/layout.ts) điền; người dùng có thể kéo
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
