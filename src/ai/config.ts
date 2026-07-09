// ─────────────────────────────────────────────────────────────────────────────
// Cấu hình OpenAI cho tính năng "AIで生成・修正" + giải thích code.
//
// API key CHƯA được cấu hình — cập nhật sau theo 1 trong 3 cách (ưu tiên từ trên
// xuống):
//   1. Biến môi trường build-time: VITE_OPENAI_API_KEY (file .env.local).
//   2. localStorage key 'bk-openai-key' (nhập tay trên trình duyệt).
//   3. Dán trực tiếp vào HARDCODED_KEY bên dưới (⚠ key sẽ nằm trong bundle
//      public trên GitHub Pages — chỉ dùng tạm khi thử nghiệm nội bộ).
// ─────────────────────────────────────────────────────────────────────────────

// Model mặc định gpt-5.1 (code tốt hơn hẳn 4o/4.1, input còn rẻ hơn 4.1). Là
// reasoning model nên client tự bỏ `temperature` (xem openai.ts). Đổi qua env
// VITE_OPENAI_MODEL (vd 'gpt-5-mini' rẻ hơn, 'gpt-4.1', 'gpt-4o').
export const OPENAI_MODEL = (import.meta.env.VITE_OPENAI_MODEL as string | undefined)?.trim() || 'gpt-5.1';
export const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// ⚠ Dán key vào đây chỉ khi chấp nhận key xuất hiện trong bundle tĩnh.
const HARDCODED_KEY = '';

export const OPENAI_KEY_STORAGE = 'bk-openai-key';

export function getOpenAiKey(): string {
  const env = (import.meta.env.VITE_OPENAI_API_KEY as string | undefined) ?? '';
  let stored = '';
  try {
    stored = localStorage.getItem(OPENAI_KEY_STORAGE) ?? '';
  } catch {
    // localStorage có thể bị chặn (private mode) — bỏ qua.
  }
  return (env || stored || HARDCODED_KEY).trim();
}
