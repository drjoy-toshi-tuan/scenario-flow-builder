import type { NodeType } from '../ir/types';
import { useLang } from './i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Cấu hình hiển thị theo NodeType: icon (Iconify/lucide), nhãn loại, màu accent.
// Dùng chung cho node trên canvas + palette "Thêm module" + panel setting.
// ─────────────────────────────────────────────────────────────────────────────

export interface NodeVisual {
  icon: string; // tên icon Iconify, vd 'lucide:play'
  typeLabel: string; // tên loại module hiển thị
  color: string; // màu accent (hex) — dùng cho viền, icon tile, chữ loại
  showTarget?: boolean; // false: node không có input (start)
  showSource?: boolean; // false: node không có output (hangup)
}

export const NODE_CONFIG: Record<NodeType, NodeVisual> = {
  start: { icon: 'lucide:play', typeLabel: 'Start', color: '#0ac4ab', showTarget: false },
  announce: { icon: 'lucide:volume-2', typeLabel: 'Announce', color: '#10b981' },
  interaction: { icon: 'mingcute:voice-fill', typeLabel: 'Interaction', color: '#0ea5e9' },
  nexus: { icon: 'lucide:git-fork', typeLabel: 'Nexus', color: '#f59e0b' },
  logic: { icon: 'mingcute:command-line', typeLabel: 'Logic', color: '#22c55e' },
  classifier: { icon: 'mingcute:classify-3-line', typeLabel: 'Classifier', color: '#fb7c25' },
  normalization: { icon: 'ph:approximate-equals-bold', typeLabel: 'Normalization', color: '#d9b806' },
  openai: { icon: 'proicons:openai', typeLabel: 'OpenAI', color: '#d946ef' },
  faq: { icon: 'lucide:messages-square', typeLabel: 'FAQ', color: '#6366f1' },
  transfer: { icon: 'lucide:phone-forwarded', typeLabel: 'Transfer', color: '#06b6d4' },
  save: { icon: 'mingcute:save-2-fill', typeLabel: 'Save', color: '#de5f1b' },
  jump: { icon: 'app:jump-flow', typeLabel: 'Jump', color: '#d10887' },
  hangup: { icon: 'lucide:phone-off', typeLabel: 'Hangup', color: '#f43f5e', showSource: false },
};

// ── Màn CS (#/cs) ──
// Bộ node CS có tên theo NGÔN NGỮ UI: tiếng Nhật theo spec team CS; tiếng Việt
// dùng tên tiếng Anh quen thuộc (Announce/Hearing/…). Chỉ các loại trong
// CS_NODE_TYPES mới có nhãn; loại khác không xuất hiện ở màn CS.
// CS KHÔNG có node Start: シナリオ設計書 là diagram luồng, node đầu tiên chính là
// điểm bắt đầu (TS mới ráp node Start kỹ thuật khi gen YAML).
export const CS_TYPE_LABELS: Partial<Record<NodeType, string>> = {
  announce: 'アナウンス',
  interaction: '聴取',
  logic: '分岐ロジック',
  transfer: '転送',
  hangup: '終話',
};

export const CS_TYPE_LABELS_VI: Partial<Record<NodeType, string>> = {
  announce: 'Announce',
  interaction: 'Hearing',
  logic: 'Logic',
  transfer: 'Transfer',
  hangup: 'Hangup',
};

// Nhãn loại node theo màn: CS lấy tên theo ngôn ngữ UI hiện tại (fallback tên
// chuẩn nếu thiếu). Đọc lang qua getState — component gọi hàm này đều đã
// subscribe ngôn ngữ (useT) nên tự re-render khi đổi.
export function nodeTypeLabel(type: NodeType, csMode: boolean): string {
  if (csMode) {
    const labels = useLang.getState().lang === 'ja' ? CS_TYPE_LABELS : CS_TYPE_LABELS_VI;
    if (labels[type]) return labels[type];
  }
  return NODE_CONFIG[type].typeLabel;
}

// Palette màn CS: bộ node tối giản cho người không kỹ thuật — vẽ luồng kịch bản +
// rẽ nhánh, không node Start, không module kỹ thuật (nexus/openai/save/jump…).
export const CS_NODE_TYPES: readonly NodeType[] = [
  'announce',
  'interaction',
  'logic',
  'transfer',
  'hangup',
];

// Loại có thể thêm qua "Thêm node". 'start' chỉ được thêm 1 lần (xem AddModulePanel).
// Save nằm ngay dưới Transfer trong menu thêm node.
export const ADDABLE_NODE_TYPES: readonly NodeType[] = [
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
