import type { NodeType } from '../ir/types';

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
  openai: { icon: 'proicons:openai', typeLabel: 'OpenAI', color: '#d946ef' },
  faq: { icon: 'lucide:messages-square', typeLabel: 'FAQ', color: '#6366f1' },
  transfer: { icon: 'lucide:phone-forwarded', typeLabel: 'Transfer', color: '#06b6d4' },
  save: { icon: 'mingcute:save-2-fill', typeLabel: 'Save', color: '#de5f1b' },
  jump: { icon: 'fluent:flow-32-regular', typeLabel: 'Jump', color: '#d10887' },
  hangup: { icon: 'lucide:phone-off', typeLabel: 'Hangup', color: '#f43f5e', showSource: false },
};

// Loại có thể thêm qua "Thêm node". 'start' chỉ được thêm 1 lần (xem AddModulePanel).
// Save nằm ngay dưới Transfer trong menu thêm node.
export const ADDABLE_NODE_TYPES: readonly NodeType[] = [
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
