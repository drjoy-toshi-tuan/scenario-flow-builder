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
  // Cấu hình kịch bản ngoài graph (General Settings / Status Settings) — sửa ở các
  // tab của màn canvas, lưu kèm file YAML (flow.settings).
  settings?: ScenarioSettings;
}

// ── Cấu hình kịch bản (các tab ngoài Flow Diagram) ───────────────────────────

export interface TimeRange {
  from: string; // "HH:mm"
  to: string;
}

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'holiday'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

// 1 ngày làm việc: bật/tắt + các khung giờ (1 ngày có thể 2-4 khung).
export interface DaySchedule {
  day: DayKey;
  enabled: boolean;
  ranges: TimeRange[];
}

// 1 dòng 状態 (Status Settings). Các status mặc định fixed=true: không xoá,
// không đổi flag — chỉ đổi được tên.
export interface StatusEntry {
  name: string;
  flag: number;
  fixed?: boolean;
}

// 1 dòng SMSフラグ. Nội dung SMS luôn kèm URL cố định 22 ký tự ở dòng cuối
// (tag 通話後送信URL — cột 文字数 đếm cả phần này).
export interface SmsFlagEntry {
  type: string; // 区分
  flag: number;
  content: string; // SMS文言 (chưa gồm URL)
}

export interface ScenarioSettings {
  mainPhone: string; // 代表電話（直通電話）
  master050: string; // 050番号 — môi trường master (本番)
  demo050: string; // 050番号 — môi trường demo
  smsNumber: string; // SMS送信番号
  workingDays: DaySchedule[]; // 稼働曜日 — luôn đủ 8 entry theo DAY_KEYS
  restPeriod: string; // 稼働休止期間 (freetext)
  silentDetectionSec: string; // 発話待機時間 (giây)
  timeoutSec: string; // 無回答待機時間 (giây)
  statuses: StatusEntry[]; // tab Status Settings — phần 状態
  smsFlags: SmsFlagEntry[]; // tab Status Settings — phần SMSフラグ
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
  | 'classifier' // các module PHÂN LOẠI (tách từ logic): Clinic Days / Clinical Department / Incoming / Date Of Call
  | 'normalization' // các module CHUẨN HOÁ (tách từ logic): Phone Normalization / DOB Re-confirmation
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
  'classifier',
  'normalization',
  'openai',
  'faq',
  'transfer',
  'save',
  'jump',
  'hangup',
] as const;

// Tên type cũ trong YAML -> tên mới (đổi tên hệ thống nhưng file cũ vẫn mở được).
// Node logic cũ mang module phân loại/chuẩn hoá được migrate THEO moduleType ở
// fromYaml (không map được ở đây vì cùng type 'logic').
export const LEGACY_TYPE_ALIASES: Record<string, NodeType> = {
  input: 'interaction',
  condition: 'nexus',
  script: 'logic',
  llm: 'openai',
  flag: 'save',
};

// 3 loại node "chọn module" (data.moduleType) tách ra từ node Logic cũ — dùng chung
// cho fromYaml/nodeSchema/flowStore để cư xử đồng nhất.
export const MODULE_NODE_TYPES: readonly NodeType[] = ['logic', 'classifier', 'normalization'] as const;
export const isModuleNodeType = (t: NodeType): boolean => MODULE_NODE_TYPES.includes(t);

// Loại node có nhánh TỰ DO (data.branches) — dùng chung cho fromYaml/toYaml/nodeSchema
// để 3 nơi không lệch nhau khi thêm loại node mới. (classifier/normalization dùng bộ
// nhánh cố định theo module nhưng vẫn lưu/đọc qua data.branches như logic.)
export const EDITABLE_BRANCH_TYPES: readonly NodeType[] = [
  'nexus',
  'logic',
  'classifier',
  'normalization',
  'jump',
] as const;

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
