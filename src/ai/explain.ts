import { buildExplainMessages } from './context';
import { chatComplete } from './openai';
import { isAiConfigured } from './config';
import { useFlowStore } from '../store/flowStore';
import type { Lang } from '../ui/i18n';

// ─────────────────────────────────────────────────────────────────────────────
// Giải thích script bằng AI. Kết quả lưu vào node.data.scriptExplanation nên
// theo file YAML (mở lại không cần gen lại).
// ─────────────────────────────────────────────────────────────────────────────

// Gọi AI đọc script -> trả về đoạn giải thích (ném AiError khi lỗi/thiếu key).
export async function explainScript(script: string, lang: Lang): Promise<string> {
  return chatComplete(buildExplainMessages(script, lang));
}

// Chạy NỀN sau khi LƯU node (再生成 tự động để phần giải nghĩa luôn fresh):
// thiếu key / script rỗng / lỗi mạng -> bỏ qua im lặng, không chặn việc lưu.
export function refreshScriptExplanation(nodeId: string, script: string, lang: Lang): void {
  if (!isAiConfigured() || !script.trim()) return;
  void explainScript(script, lang)
    .then((text) => {
      useFlowStore.getState().setNodeData(nodeId, { scriptExplanation: text });
    })
    .catch(() => {
      // chạy nền — lỗi không cần báo, giữ nguyên giải thích cũ.
    });
}
