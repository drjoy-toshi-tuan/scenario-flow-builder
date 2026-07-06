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
  input: { icon: 'mingcute:voice-fill', typeLabel: 'Input', color: '#0ea5e9' },
  condition: { icon: 'lucide:git-fork', typeLabel: 'Condition', color: '#f59e0b' },
  script: { icon: 'tabler:file-code-filled', typeLabel: 'Logic', color: '#22c55e' },
  llm: { icon: 'mingcute:ai-fill', typeLabel: 'LLM', color: '#d946ef' },
  faq: { icon: 'lucide:messages-square', typeLabel: 'FAQ', color: '#6366f1' },
  transfer: { icon: 'lucide:phone-forwarded', typeLabel: 'Transfer', color: '#06b6d4' },
  flag: { icon: 'mingcute:flag-4-fill', typeLabel: 'Flag', color: '#de5f1b' },
  hangup: { icon: 'lucide:phone-off', typeLabel: 'Hangup', color: '#f43f5e', showSource: false },
};

// Loại có thể thêm qua "Thêm node". 'start' chỉ được thêm 1 lần (xem AddModulePanel).
// Flag nằm ngay dưới Transfer trong menu thêm node.
export const ADDABLE_NODE_TYPES: readonly NodeType[] = [
  'start',
  'announce',
  'input',
  'condition',
  'script',
  'llm',
  'faq',
  'transfer',
  'flag',
  'hangup',
] as const;
